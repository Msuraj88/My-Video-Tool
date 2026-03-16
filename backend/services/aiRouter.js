/**
 * Routes audio generation to the selected TTS provider.
 * No fallback; uses only the requested provider.
 */

const { generateAndSaveAudio } = require('./audioGeneration.service');

/**
 * Generate audio for a scene using the specified TTS provider.
 * @param {string} script - Scene text to synthesize
 * @param {string} provider - "google" | "elevenlabs"
 * @param {string} sceneName - Scene identifier for filenames
 * @param {{ voiceId?: string }} [options] - Optional (e.g. voiceId for ElevenLabs)
 * @returns {Promise<{ filePath: string, duration: number }|{ error: string, details: any }>}
 */
async function generateAudio(script, provider, sceneName, options = {}) {
    const p = (provider || '').toLowerCase();

    if (p === 'google') {
        return await generateAndSaveAudio(script, sceneName, 'google', options);
    }
    if (p === 'elevenlabs') {
        return await generateAndSaveAudio(script, sceneName, 'elevenlabs', options);
    }

    throw new Error(`Unsupported TTS provider: ${provider}`);
}

module.exports = { generateAudio };
