const fs = require('fs');
const path = require('path');
const { frameImageForVideo, TARGET_WIDTH, TARGET_HEIGHT } = require('../utils/imageFraming');
const { imagesDir } = require('../utils/tempDirs');

// FLUX_MODEL: "flux2pro" (best HD), "pro1.1", "pro", "dev", "schnell". Use flux2pro for sharp, high-quality images.
const FLUX_MODEL = (process.env.FLUX_MODEL || 'flux2pro').toLowerCase();
const FAL_ENDPOINTS = {
    flux2pro: 'https://fal.run/fal-ai/flux-2-pro',
    pro11: 'https://fal.run/fal-ai/flux-pro/v1.1',
    schnell: 'https://fal.run/fal-ai/flux/schnell',
    dev: 'https://fal.run/fal-ai/flux/dev',
    pro: 'https://fal.run/fal-ai/flux/pro'
};
const fluxEndpoint = process.env.FAL_FLUX_ENDPOINT || FAL_ENDPOINTS[FLUX_MODEL] || FAL_ENDPOINTS.flux2pro;
// Flux 2 Pro is zero-config; legacy flux uses steps (more steps = sharper).
const numInferenceSteps = (FLUX_MODEL === 'schnell') ? 4 : (parseInt(process.env.FLUX_INFERENCE_STEPS, 10) || 35);
const isFlux2OrPro11 = FLUX_MODEL === 'flux2pro' || FLUX_MODEL === 'pro11';

const { generateAndSaveSceneImageGoogle } = require('./googleImage.service');

/**
 * Calls Flux API (dev/pro preferred) and saves the generated image as a PNG.
 * Guarantees 1280x720 HD output.
 * @param {string} prompt - Fully built visual prompt (locked character + 2D outline style + scene).
 * @param {string} sceneName - Unique identifier/name for the scene to use as the filename.
 * @param {{ negativePrompt?: string }} [options] - Optional negative prompt to avoid unwanted styles.
 * @returns {Promise<string>} - The local absolute path where the image was saved.
 */
async function generateAndSaveSceneImageFal(prompt, sceneName, options = {}) {
    const apiKey = process.env.FAL_KEY || process.env.FLUX_API_KEY;
    if (!apiKey) {
        throw new Error('FAL_KEY or FLUX_API_KEY environment variable is required for Fal image generation.');
    }

    try {
        console.log(`Generating image for scene: ${sceneName} (model: ${FLUX_MODEL})...`);

        // Flux 2 Pro / Flux Pro 1.1: HD models with simpler schema (no steps/guidance); request native 16:9 for sharpness.
        const imageSize = { width: TARGET_WIDTH, height: TARGET_HEIGHT };
        let body;
        if (isFlux2OrPro11) {
            body = {
                prompt,
                image_size: imageSize,
                output_format: 'png',
                enable_safety_checker: true
            };
            if (FLUX_MODEL === 'pro11') {
                body.enhance_prompt = true; // Better composition and detail for Pro 1.1
            }
        } else {
            body = {
                prompt,
                image_size: imageSize,
                num_inference_steps: numInferenceSteps,
                guidance_scale: 3.5,
                seed: 12345,
                num_images: 1,
                enable_safety_checker: true
            };
            if (options.negativePrompt && options.negativePrompt.trim()) {
                body.negative_prompt = options.negativePrompt.trim();
            }
        }

        const response = await fetch(fluxEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Flux API Request Failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const imageUrl = data.images?.[0]?.url;

        if (!imageUrl) {
            throw new Error('No image URL returned from Flux API');
        }

        console.log(`Downloading generated image from: ${imageUrl}`);

        // Download the generated image from the provided URL
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Sanitize the scene name for file system
        const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = Date.now();
        const baseName = `${safeSceneName}_${timestamp}`;
        const originalPath = path.join(imagesDir(), `${baseName}_raw.png`);
        const finalPath = path.join(imagesDir(), `${baseName}.png`);

        fs.writeFileSync(originalPath, buffer);

        // Always output 1280x720.
        const fullHdBuffer = await frameImageForVideo(buffer);
        fs.writeFileSync(finalPath, fullHdBuffer);
        console.log(`Successfully saved scene image to ${finalPath} (${TARGET_WIDTH}x${TARGET_HEIGHT} padded no-crop frame)`);

        return finalPath;

    } catch (error) {
        console.error(`Error generating image for ${sceneName}:`, error.message);
        throw error; // Rethrow to let the caller handle it (e.g. retries)
    }
}

/**
 * Dispatcher for image generation. Uses only the selected provider; no fallback.
 */
async function generateAndSaveSceneImage(prompt, sceneName, provider = 'fal', options = {}) {
    const p = (provider || '').toLowerCase();
    if (p === 'google') {
        return await generateAndSaveSceneImageGoogle(prompt, sceneName, options);
    }
    if (p === 'flux' || p === 'fal') {
        return await generateAndSaveSceneImageFal(prompt, sceneName, options);
    }
    throw new Error(`Unsupported image provider selected: ${provider}`);
}

module.exports = {
    generateAndSaveSceneImage
};
