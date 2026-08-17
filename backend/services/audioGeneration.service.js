const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { audioDir } = require('../utils/tempDirs');
const { TTS_PACE, flattenForEvenPace } = require('../config/ttsPace');

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
    return flattenForEvenPace(text);
}

/**
 * Returns ElevenLabs voice_settings for the given narration mode.
 * explainer = confident, clear, educational (finance/business/documentary).
 * @param {string} mode - "explainer" | "cinematic" | "shorts" | "dramatic"
 * @returns {{ stability: number, similarity_boost: number, style: number, use_speaker_boost: boolean }}
 */
function getVoiceSettings() {
    return {
        stability: TTS_PACE.elevenStability,
        similarity_boost: TTS_PACE.elevenSimilarity,
        style: TTS_PACE.elevenStyle,
        use_speaker_boost: true,
        speed: TTS_PACE.elevenSpeed,
    };
}

const { generateAndSaveAudioGoogle } = require('./googleTTS.service');
const { generateAndSaveAudioSarvam } = require('./sarvamTTS.service');

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
        const voiceSettings = getVoiceSettings();

        const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
            text: normalizedText,
            modelId: MODEL_ID,
            outputFormat: 'mp3_44100_128',
            voice_settings: voiceSettings,
            seed: 17,
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
        const filePath = path.join(audioDir(), fileName);

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
    if (p === 'sarvam') {
        return await generateAndSaveAudioSarvam(text, sceneName);
    }
    throw new Error(`Unsupported TTS provider selected: ${provider}`);
}

/** Bump this to force a one-time rebuild of saved scene MP3s. */
const AUDIO_RENDER_VERSION = 'v3-batch-lowtemp';

function providerCharLimit(provider) {
    const p = (provider || '').toLowerCase();
    if (p === 'sarvam') return 2400;
    if (p === 'google') return 4000;
    return 4500;
}

function joinSceneNarration(texts) {
    return texts
        .map((text) => {
            const normalized = flattenForEvenPace(text);
            if (!normalized) return '';
            if (/[।.!?]$/.test(normalized)) return normalized;
            return `${normalized}।`;
        })
        .filter(Boolean)
        .join(' ');
}

function groupScenesForLimit(scenes, limit) {
    const groups = [];
    let current = [];
    let len = 0;
    for (const scene of scenes) {
        const piece = flattenForEvenPace(scene.text);
        const extra = (current.length ? 1 : 0) + piece.length;
        if (current.length && len + extra > limit) {
            groups.push(current);
            current = [scene];
            len = piece.length;
        } else {
            current.push(scene);
            len += extra;
        }
    }
    if (current.length) groups.push(current);
    return groups;
}

/**
 * One TTS take for consecutive scenes, then split on silence near scene boundaries.
 * That keeps speaker, pitch, and pace the same instead of a new random take per scene.
 */
async function generateConsistentSceneAudio(scenes, provider, projectId) {
    const { splitAudioByTextWeights } = require('./audioSplit.service');
    const groups = groupScenesForLimit(scenes, providerCharLimit(provider));
    const clips = [];

    for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const texts = group.map((scene) => scene.text);
        const joined = joinSceneNarration(texts);
        const batchName = `${projectId}_narration_${g + 1}`;
        const result = await generateAndSaveAudio(joined, batchName, provider);
        if (result.error) {
            return result;
        }

        let partPaths = [result.filePath];
        if (group.length > 1) {
            partPaths = await splitAudioByTextWeights(
                result.filePath,
                texts.map((t) => flattenForEvenPace(t)),
                `${projectId}_g${g + 1}`
            );
        }

        for (let i = 0; i < group.length; i++) {
            const filePath = partPaths[i];
            const duration = await getAudioDurationInSeconds(filePath);
            clips.push({
                sceneId: group[i].sceneId,
                filePath,
                duration,
            });
        }
    }

    return { clips, version: AUDIO_RENDER_VERSION };
}

module.exports = {
    generateAndSaveAudio,
    generateConsistentSceneAudio,
    AUDIO_RENDER_VERSION,
    normalizeForTTS,
    getVoiceSettings,
    MODE
};
