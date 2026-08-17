/**
 * Sarvam AI (Indus / Bulbul) text-to-speech.
 * REST: POST https://api.sarvam.ai/text-to-speech
 * Default speaker: shubh (bulbul:v3).
 */

const fs = require('fs');
const path = require('path');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { audioDir } = require('../utils/tempDirs');
const { TTS_PACE, flattenForEvenPace } = require('../config/ttsPace');

const fetchFn = typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : require('node-fetch');

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const MAX_CHARS = 2500;
const DEFAULT_SPEAKER = 'shubh';
const DEFAULT_MODEL = 'bulbul:v3';
const DEFAULT_LANGUAGE = process.env.SARVAM_TTS_LANGUAGE_CODE || process.env.GOOGLE_TTS_LANGUAGE_CODE || 'hi-IN';

function normalizeText(text) {
    return flattenForEvenPace(text);
}

function getSpeaker() {
    return String(process.env.SARVAM_TTS_SPEAKER || DEFAULT_SPEAKER).trim().toLowerCase() || DEFAULT_SPEAKER;
}

function getModel() {
    return process.env.SARVAM_TTS_MODEL || DEFAULT_MODEL;
}

function getLanguageCode() {
    return process.env.SARVAM_TTS_LANGUAGE_CODE || DEFAULT_LANGUAGE;
}

function getPace() {
    const pace = parseFloat(process.env.SARVAM_TTS_PACE || String(TTS_PACE.sarvamPace));
    if (!Number.isFinite(pace)) return TTS_PACE.sarvamPace;
    return Math.min(2, Math.max(0.5, pace));
}

function getTemperature() {
    const temperature = parseFloat(
        process.env.SARVAM_TTS_TEMPERATURE || String(TTS_PACE.sarvamTemperature)
    );
    if (!Number.isFinite(temperature)) return TTS_PACE.sarvamTemperature;
    return Math.min(1, Math.max(0.01, temperature));
}

/**
 * @param {string} text
 * @param {string} sceneName
 * @returns {Promise<{ filePath: string, duration: number }|{ error: string, details: any }>}
 */
async function generateAndSaveAudioSarvam(text, sceneName) {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
        return { error: 'SARVAM_API_KEY environment variable is missing.' };
    }

    const normalized = normalizeText(text);
    if (!normalized) {
        return { error: 'Text is empty after normalization.' };
    }

    const inputText = normalized.length > MAX_CHARS ? normalized.slice(0, MAX_CHARS) : normalized;
    const speaker = getSpeaker();
    const model = getModel();
    const languageCode = getLanguageCode();
    const pace = getPace();
    const temperature = getTemperature();

    try {
        console.log(
            `Generating Sarvam TTS for '${sceneName}' (model: ${model}, speaker: ${speaker}, lang: ${languageCode}, pace: ${pace}, temp: ${temperature})...`
        );

        const response = await fetchFn(SARVAM_TTS_URL, {
            method: 'POST',
            headers: {
                'api-subscription-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: inputText,
                model,
                speaker,
                language_code: languageCode,
                pace,
                temperature,
                output_audio_codec: 'mp3',
                speech_sample_rate: 24000,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data.error?.message || data.message || JSON.stringify(data);
            return { error: 'Sarvam TTS failed', details: `${response.status}: ${message}` };
        }

        const audioB64 = Array.isArray(data.audios) ? data.audios.filter(Boolean).join('') : '';
        if (!audioB64) {
            return { error: 'Sarvam TTS returned no audio', details: data.error?.message || 'Missing audios' };
        }

        const audioBuffer = Buffer.from(audioB64, 'base64');
        const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `${safeSceneName}_sarvam_${Date.now()}.mp3`;
        const filePath = path.join(audioDir(), fileName);
        fs.writeFileSync(filePath, audioBuffer);

        const duration = await getAudioDurationInSeconds(filePath);
        console.log(`Sarvam TTS saved to ${filePath}, ${duration.toFixed(2)}s`);
        return { filePath, duration };
    } catch (error) {
        console.error(`Sarvam TTS Error for ${sceneName}:`, error.message);
        return { error: 'Sarvam TTS failed', details: error.message };
    }
}

module.exports = {
    generateAndSaveAudioSarvam,
};
