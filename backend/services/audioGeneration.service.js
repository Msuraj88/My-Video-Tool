const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const { getAudioDurationInSeconds } = require('get-audio-duration');

// Ensure temp directory exists
const tempAudioDir = path.join(__dirname, '../temp/audio');
if (!fs.existsSync(tempAudioDir)) {
    fs.mkdirSync(tempAudioDir, { recursive: true });
}

// You can change to a specific voice ID (e.g., Adam, Rachel, etc.)
// Defaulting to "Adam" voice ID for now
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';

// Allow model configuration via .env, fallback to multilingual_v2
const MODEL_ID = process.env.ELEVEN_MODEL || "eleven_multilingual_v2";

// Narration mode: explainer | cinematic | shorts | dramatic (env NARRATION_MODE)
// Default "explainer" = confident, clear, finance/business/documentary style
const MODE = process.env.NARRATION_MODE || "explainer";

/**
 * Normalizes text for TTS: trim, collapse runs of whitespace/newlines to single space,
 * and strip control characters that can affect pacing.
 * @param {string} text - Raw input text
 * @returns {string} - Normalized text safe for TTS
 */
function normalizeForTTS(text) {
    if (text == null || typeof text !== 'string') return '';
    return text
        .trim()
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars, keep \t \n \r
        .replace(/[ \t]+/g, ' ')                            // collapse spaces/tabs only (keep newlines for pacing)
        .replace(/\n\s*\n\s*\n+/g, '\n\n')                 // max 2 consecutive newlines
        .trim();
}

/**
 * Returns ElevenLabs voice_settings for the given narration mode.
 * explainer = confident, clear, educational (finance/business/documentary).
 * @param {string} mode - "explainer" | "cinematic" | "shorts" | "dramatic"
 * @returns {{ stability: number, similarity_boost: number, style: number, use_speaker_boost: boolean }}
 */
function getVoiceSettings(mode) {
    const presets = {
        explainer: { stability: 0.70, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true },
        cinematic: { stability: 0.62, similarity_boost: 0.75, style: 0.38, use_speaker_boost: true },
        shorts: { stability: 0.68, similarity_boost: 0.75, style: 0.30, use_speaker_boost: true },
        dramatic: { stability: 0.50, similarity_boost: 0.75, style: 0.65, use_speaker_boost: true }
    };
    return presets[mode] || presets.explainer;
}

const { generateAndSaveAudioGoogle } = require('./googleTTS.service');

/**
 * Calls ElevenLabs API to generate TTS audio and saves it as an MP3.
 * Calculates and returns the duration of the audio in seconds.
 * 
 * @param {string} text - The text to be converted to speech.
 * @param {string} sceneName - Unique identifier for the scene (used for filename).
 * @param {string} [voiceId] - Optional ElevenLabs Voice ID (defaults to Adam).
 * @returns {Promise<{ filePath: string, duration: number }|{ error: string, details: any }>} - Path/duration, or error object
 */
async function generateAndSaveAudioEleven(text, sceneName, voiceId = DEFAULT_VOICE_ID) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        return { error: 'ELEVENLABS_API_KEY environment variable is missing.' };
    }

    try {
        console.log(`Generating audio for scene '${sceneName}' using ElevenLabs model '${MODEL_ID}' (mode: ${MODE})...`);

        const elevenlabs = new ElevenLabsClient({ apiKey });
        const normalizedText = normalizeForTTS(text);
        const voiceSettings = getVoiceSettings(MODE);

        const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
            text: normalizedText,
            modelId: MODEL_ID,
            outputFormat: 'mp3_44100_128',
            voice_settings: voiceSettings
        });

        // The SDK returns a web stream, so we convert it to a Node Readable stream buffer to write to disk
        const reader = audioStream.getReader();
        const chunks = [];
        let done, value;

        while (true) {
            ({ done, value } = await reader.read());
            if (done) break;
            chunks.push(value);
        }

        const audioBuffer = Buffer.concat(chunks);

        // Prepare file path
        const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `${safeSceneName}_${Date.now()}.mp3`;
        const filePath = path.join(tempAudioDir, fileName);

        // Save audio to disk
        fs.writeFileSync(filePath, audioBuffer);
        console.log(`Successfully saved audio to ${filePath}`);

        // Read audio duration
        const duration = await getAudioDurationInSeconds(filePath);
        console.log(`Audio duration for ${sceneName}: ${duration.toFixed(2)} seconds`);

        return {
            filePath,
            duration
        };

    } catch (error) {
        // Handle ElevenLabs SDK Errors
        console.error(`ElevenLabs SDK Error for ${sceneName}:`, error.message);
        return { error: 'SDK error communicating with ElevenLabs', details: error.message };
    }
}

/**
 * Dispatcher for audio generation. Uses only the selected provider; no fallback.
 */
async function generateAndSaveAudio(text, sceneName, provider = 'elevenlabs', options = {}) {
    const p = (provider || '').toLowerCase();
    if (p === 'google') {
        return await generateAndSaveAudioGoogle(text, sceneName);
    }
    if (p === 'elevenlabs') {
        return await generateAndSaveAudioEleven(text, sceneName, options.voiceId);
    }
    throw new Error(`Unsupported TTS provider selected: ${provider}`);
}

module.exports = {
    generateAndSaveAudio,
    normalizeForTTS,
    getVoiceSettings,
    MODE
};
