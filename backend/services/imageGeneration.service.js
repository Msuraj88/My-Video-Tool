const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Ensure temp directory exists
const tempImagesDir = path.join(__dirname, '../temp/images');
if (!fs.existsSync(tempImagesDir)) {
    fs.mkdirSync(tempImagesDir, { recursive: true });
}

// Target resolution for all scene images
const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

// Prefer flux-dev or flux-pro for quality; avoid flux-schnell for final explainer images.
// Set FLUX_MODEL to "dev" or "pro"; set FAL_FLUX_ENDPOINT to override URL (e.g. fal.run/fal-ai/flux-2-pro).
const FLUX_MODEL = process.env.FLUX_MODEL || 'dev';
const FAL_ENDPOINTS = {
    schnell: 'https://fal.run/fal-ai/flux/schnell',
    dev: 'https://fal.run/fal-ai/flux/dev',
    pro: 'https://fal.run/fal-ai/flux/pro'
};
const fluxEndpoint = process.env.FAL_FLUX_ENDPOINT || (FAL_ENDPOINTS[FLUX_MODEL] || FAL_ENDPOINTS.dev);
// More steps for dev/pro reduce blur and improve sharpness (28–35 typical for Flux).
const numInferenceSteps = FLUX_MODEL === 'schnell' ? 4 : (parseInt(process.env.FLUX_INFERENCE_STEPS, 10) || 35);

/**
 * Calls Flux API (dev/pro preferred) and saves the generated image as a PNG.
 * Guarantees 1920x1080 output (upscales with sharp if needed).
 * @param {string} prompt - The fully built visual prompt (no text, no numbers).
 * @param {string} sceneName - Unique identifier/name for the scene to use as the filename.
 * @param {{ negativePrompt?: string }} [options] - Optional negative prompt to avoid unwanted styles.
 * @returns {Promise<string>} - The local absolute path where the image was saved.
 */
async function generateAndSaveSceneImage(prompt, sceneName, options = {}) {
    const apiKey = process.env.FLUX_API_KEY;
    if (!apiKey) {
        throw new Error('FLUX_API_KEY environment variable is missing.');
    }

    try {
        console.log(`Generating image for scene: ${sceneName} (model: ${FLUX_MODEL})...`);

        const body = {
            prompt,
            image_size: 'landscape_16_9',
            num_inference_steps: numInferenceSteps,
            guidance_scale: 3.5,
            seed: 12345,
            num_images: 1,
            enable_safety_checker: true
        };
        if (options.negativePrompt && options.negativePrompt.trim()) {
            body.negative_prompt = options.negativePrompt.trim();
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
        const originalPath = path.join(tempImagesDir, `${baseName}_raw.png`);
        const finalPath = path.join(tempImagesDir, `${baseName}.png`);

        // Save original image
        fs.writeFileSync(originalPath, buffer);

        // Ensure final image is exactly 1920x1080; apply mild sharpen to avoid blur
        try {
            const metadata = await sharp(originalPath).metadata();
            const needsResize = metadata.width !== TARGET_WIDTH || metadata.height !== TARGET_HEIGHT;
            let pipeline = sharp(originalPath);
            if (needsResize) {
                pipeline = pipeline.resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', kernel: sharp.kernel.lanczos3 });
            }
            pipeline = pipeline.sharpen({ sigma: 0.5, m1: 1.0, m2: 0.5 });
            await pipeline.toFile(finalPath);
            console.log(`Successfully saved scene image to ${finalPath} (1920x1080, sharpened)`);
        } catch (resizeError) {
            console.error('Error ensuring 1920x1080 resolution, using original image:', resizeError.message);
            fs.copyFileSync(originalPath, finalPath);
        }

        return finalPath;

    } catch (error) {
        console.error(`Error generating image for ${sceneName}:`, error.message);
        throw error; // Rethrow to let the caller handle it (e.g. retries)
    }
}

module.exports = {
    generateAndSaveSceneImage
};
