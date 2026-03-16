/**
 * Google Cloud Text-to-Speech: Chirp 3 HD and Studio voices.
 * MP3 encoding, minimal SSML, natural pacing for narration.
 */
const fs = require('fs');
const path = require('path');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { getKeyPath, getGoogleAccessToken } = require('../utils/googleAuth');

const fetchTts = typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : require('node-fetch');

const tempAudioDir = path.join(__dirname, '../temp/audio');
if (!fs.existsSync(tempAudioDir)) {
    fs.mkdirSync(tempAudioDir, { recursive: true });
}

const MAX_INPUT_BYTES = 4500;

const AUDIO_ENCODING = process.env.GOOGLE_TTS_ENCODING || 'MP3';
const SPEAKING_RATE = parseFloat(process.env.GOOGLE_TTS_SPEED || '0.97');
const VOLUME_GAIN_DB = parseFloat(process.env.GOOGLE_TTS_VOLUME_GAIN || '0');
const PITCH_SEMITONES = parseFloat(process.env.GOOGLE_TTS_PITCH || '-1');

// Chirp 3: HD voices (realistic, emotional) – Algenib = male, deep baritone
const CHIRP3_HD_ALGENIB = 'en-US-Chirp3-HD-Algenib';

// Voice style mapping: Chirp 3 HD (default) + Journey options
const VOICE_STYLE_MAP = {
    // Chirp 3 HD (default)
    'chirp3_hd_algenib': CHIRP3_HD_ALGENIB,
    'algenib': CHIRP3_HD_ALGENIB,
    // Journey
    'male_conversational': 'en-US-Journey-D',
    'female_conversational': 'en-US-Journey-F',
    'male_formal': 'en-US-Journey-J',
    'female_formal': 'en-US-Journey-O',
};
const DEFAULT_VOICE_STYLE = 'chirp3_hd_algenib';

function getVoiceName() {
    if (process.env.GOOGLE_TTS_VOICE) return process.env.GOOGLE_TTS_VOICE;
    const style = (process.env.GOOGLE_TTS_VOICE_STYLE || DEFAULT_VOICE_STYLE).toLowerCase().replace(/\s+/g, '_');
    return VOICE_STYLE_MAP[style] || VOICE_STYLE_MAP[DEFAULT_VOICE_STYLE];
}

function isStudioVoice(voiceName) {
    return typeof voiceName === 'string' && /-Studio-/i.test(voiceName);
}

function normalizeTextForGoogleTTS(text) {
    if (text == null || typeof text !== 'string') return '';
    return text
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

const MAX_SSML_BYTES = 4800; // Keep under Google's 5000-byte request limit

// Pause durations (ms). Set to 0 to disable. Sentence = after .!?; clause = after — or :; comma = after ,
const PAUSE_SENTENCE_MS = Math.max(0, parseInt(process.env.GOOGLE_TTS_PAUSE_SENTENCE_MS, 10) || 500);
const PAUSE_CLAUSE_MS = Math.max(0, parseInt(process.env.GOOGLE_TTS_PAUSE_CLAUSE_MS, 10) || 300);
const PAUSE_COMMA_MS = Math.max(0, parseInt(process.env.GOOGLE_TTS_PAUSE_COMMA_MS, 10) || 200);

function truncateToByteLength(str, maxBytes) {
    const buf = Buffer.from(str, 'utf8');
    if (buf.length <= maxBytes) return str;
    let len = maxBytes;
    while (len > 0 && (buf[len - 1] & 0xC0) === 0x80) len--; // don't cut mid-UTF8
    return buf.slice(0, len).toString('utf8');
}

/** Escape text for use inside SSML (avoid broken markup). */
function escapeSsml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Build SSML: escape, truncate, minimal prosody, proper pauses at sentence/clause/comma.
 * Chirp 3 HD supports prosody; Studio voices get rate only (no pitch in SSML).
 */
function buildSsmlForPaceAndPause(text, voiceName) {
    let t = escapeSsml(text.trim());
    if (!t) return '<speak></speak>';

    const maxBytes = MAX_SSML_BYTES - 200;
    t = truncateToByteLength(t, maxBytes);

    // Sentence-ending pause (after . ! ?)
    if (PAUSE_SENTENCE_MS > 0) {
        t = t.replace(/([.!?])\s+/g, `$1 <break time="${PAUSE_SENTENCE_MS}ms"/> `);
    }
    // Clause pause (after em dash, en dash, or colon) e.g. "The Due Date — when you have to pay"
    if (PAUSE_CLAUSE_MS > 0) {
        t = t.replace(/\s*(—|–)\s+/g, ` <break time="${PAUSE_CLAUSE_MS}ms"/> `); // em dash U+2014, en dash U+2013
        t = t.replace(/(:)\s+/g, `$1 <break time="${PAUSE_CLAUSE_MS}ms"/> `);
    }
    // Short pause after comma (helps rhythm in longer sentences)
    if (PAUSE_COMMA_MS > 0) {
        t = t.replace(/(,)\s+/g, `$1 <break time="${PAUSE_COMMA_MS}ms"/> `);
    }

    if (isStudioVoice(voiceName)) {
        return `<speak><prosody rate="0.97">${t}</prosody></speak>`;
    }
    return `<speak><prosody rate="0.97" pitch="-1st">${t}</prosody></speak>`;
}

function getAudioConfig(voiceName) {
    const config = {
        audioEncoding: AUDIO_ENCODING,
        speakingRate: SPEAKING_RATE,
        volumeGainDb: VOLUME_GAIN_DB,
        pitch: PITCH_SEMITONES,
    };
    if (isStudioVoice(voiceName)) {
        delete config.pitch;
    }
    return config;
}

function saveAudioFromResponse(audioContentBase64, sceneName) {
    const audioBuffer = Buffer.from(audioContentBase64, 'base64');
    const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${safeSceneName}_google_${Date.now()}.mp3`;
    const filePath = path.join(tempAudioDir, fileName);
    fs.writeFileSync(filePath, audioBuffer);
    return filePath;
}

async function synthesizeWithServiceAccountREST(inputText, sceneName) {
    const accessToken = await getGoogleAccessToken();
    const voiceName = getVoiceName();
    const ssml = buildSsmlForPaceAndPause(inputText, voiceName);
    const url = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    const response = await fetchTts(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            input: { ssml },
            voice: { languageCode: 'en-US', name: voiceName },
            audioConfig: getAudioConfig(voiceName),
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        return { error: 'Google TTS REST failed', details: `${response.status}: ${data.error?.message || 'Unknown'}` };
    }
    if (!data.audioContent) {
        return { error: 'Google TTS returned no audio', details: data.error?.message || 'Missing audioContent' };
    }
    const filePath = saveAudioFromResponse(data.audioContent, sceneName);
    const duration = await getAudioDurationInSeconds(filePath);
    console.log(`Google TTS (service account REST) saved to ${filePath}, ${duration.toFixed(2)}s`);
    return { filePath, duration };
}

async function generateAndSaveAudioGoogle(text, sceneName) {
    const normalized = normalizeTextForGoogleTTS(text);
    if (!normalized) {
        return { error: 'Text is empty after normalization.' };
    }

    const inputText = Buffer.byteLength(normalized, 'utf8') > MAX_INPUT_BYTES
        ? truncateToByteLength(normalized, MAX_INPUT_BYTES - 50)
        : normalized;

    try {
        console.log(`Generating Google TTS for scene '${sceneName}' (voice: ${getVoiceName()})...`);
        return await synthesizeWithServiceAccountREST(inputText, sceneName);
    } catch (error) {
        console.error(`Google TTS Error for ${sceneName}:`, error.message);
        return {
            error: 'Google TTS failed',
            details: error.message,
        };
    }
}

module.exports = {
    generateAndSaveAudioGoogle
};
