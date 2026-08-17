/**
 * Routes image generation to the selected provider.
 * No fallback; uses only the requested provider.
 */

const { generateAndSaveSceneImage } = require('./imageGeneration.service');

/**
 * Generate a scene image using the specified provider.
 * @param {string} prompt - Image prompt
 * @param {string} provider - "google" | "flux" | "fal"
 * @param {string} sceneName - Scene identifier for filenames
 * @param {{ negativePrompt?: string }} [options] - Optional (e.g. negativePrompt)
 * @returns {Promise<string>} Path to saved image (1280x720 PNG)
 */
async function generateImage(prompt, provider, sceneName, options = {}) {
    const p = (provider || '').toLowerCase();

    if (p === 'google') {
        return await generateAndSaveSceneImage(prompt, sceneName, 'google', options);
    }
    if (p === 'flux' || p === 'fal') {
        return await generateAndSaveSceneImage(prompt, sceneName, p, options);
    }

    throw new Error(`Unsupported image provider: ${provider}`);
}

module.exports = { generateImage };
