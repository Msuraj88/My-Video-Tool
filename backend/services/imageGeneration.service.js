const fs = require('fs');
const path = require('path');
const { frameImageForVideo, TARGET_WIDTH, TARGET_HEIGHT } = require('../utils/imageFraming');
const { imagesDir } = require('../utils/tempDirs');
const { buildStoryFirstPrompt } = require('../utils/storyPromptBuilder');

// FLUX_MODEL: "schnell" (default), "flux2pro", "pro1.1", "pro", "dev". Override via FLUX_MODEL in .env.
const FLUX_MODEL = (process.env.FLUX_MODEL || 'schnell').toLowerCase();
const FAL_ENDPOINTS = {
    flux2pro: 'https://fal.run/fal-ai/flux-2-pro',
    pro11: 'https://fal.run/fal-ai/flux-pro/v1.1',
    schnell: 'https://fal.run/fal-ai/flux/schnell',
    dev: 'https://fal.run/fal-ai/flux/dev',
    pro: 'https://fal.run/fal-ai/flux/pro'
};
const fluxEndpoint = process.env.FAL_FLUX_ENDPOINT || FAL_ENDPOINTS[FLUX_MODEL] || FAL_ENDPOINTS.schnell;
// Schnell: Fal examples use 8–10 steps; 4 is fast but drifts style. Override with FLUX_INFERENCE_STEPS.
const numInferenceSteps = (FLUX_MODEL === 'schnell')
    ? (parseInt(process.env.FLUX_INFERENCE_STEPS, 10) || 8)
    : (parseInt(process.env.FLUX_INFERENCE_STEPS, 10) || 35);
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
const TRANSIENT_CODES = new Set([
    'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
    'ECONNABORTED', 'ENETUNREACH', 'EAI_AGAIN', 'ERR_NETWORK',
]);
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);
const PERMANENT_HTTP = new Set([400, 401, 403, 422]);
const RETRY_DELAYS_MS = [0, 2000, 5000, 10000]; // attempt 1=immediate, 2=2s, 3=5s, 4=10s
const FAL_TIMEOUT_MS = 60000; // 60 s per attempt

function isTransientError(err) {
    // Check nested cause code (TypeError: fetch failed wraps the real error)
    const causeCode = err?.cause?.code || err?.code || '';
    if (TRANSIENT_CODES.has(causeCode)) return true;
    // Some environments surface the code on the error itself
    const msg = String(err?.message || '');
    if (/fetch failed|socket hang up|network|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(msg)) return true;
    return false;
}

async function generateAndSaveSceneImageFal(prompt, sceneName, options = {}) {
    const apiKey = process.env.FAL_KEY || process.env.FLUX_API_KEY;
    if (!apiKey) {
        throw new Error('FAL_KEY or FLUX_API_KEY environment variable is required for Fal image generation.');
    }

    const MAX_ATTEMPTS = 4;
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? 10000;
        if (delayMs > 0) {
            console.log(`[FAL] Retrying in ${delayMs / 1000}s...`);
            await new Promise((r) => setTimeout(r, delayMs));
        }

        console.log(`[FAL] Attempt ${attempt}/${MAX_ATTEMPTS} — scene: ${sceneName}`);

        try {
            return await _doGenerateFal(prompt, sceneName, options, apiKey);
        } catch (err) {
            lastError = err;

            // Extract HTTP status if present
            const statusMatch = String(err?.message || '').match(/Flux API Request Failed:\s*(\d+)/);
            const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;

            if (httpStatus && PERMANENT_HTTP.has(httpStatus)) {
                console.error(`[FAL] Permanent error ${httpStatus} — not retrying.`);
                break;
            }

            const transient = isTransientError(err) || (httpStatus && TRANSIENT_HTTP.has(httpStatus));
            const causeCode = err?.cause?.code || err?.code || '';
            console.error(`[FAL] Request failed: ${causeCode || err.message}`);

            if (!transient || attempt === MAX_ATTEMPTS) break;
        }
    }

    const causeCode = lastError?.cause?.code || lastError?.code || '';
    const isNet = isTransientError(lastError);
    const summary = isNet
        ? `FAL image generation failed after ${MAX_ATTEMPTS} attempts.\nNetwork/DNS error: ${causeCode || lastError?.message}\nPlease check DNS/network connectivity to fal.run.`
        : `FAL image generation failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`;
    const wrapped = new Error(summary);
    wrapped.cause = lastError;
    throw wrapped;
}

function falSeedForScene(sceneName, prompt) {
    let h = 2166136261;
    const input = `${sceneName}:${String(prompt || '').slice(0, 512)}:${Date.now()}`;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (Math.abs(h) % 2147483646) + 1;
}

/** Fal: story/concept first, then compact style lock. */
function buildFluxPrompt(fullPrompt, negativePrompt) {
    return buildStoryFirstPrompt(fullPrompt, { negativePrompt, compactStyle: true });
}

async function _doGenerateFal(prompt, sceneName, options, apiKey) {
    const fluxPrompt = buildFluxPrompt(prompt, options.negativePrompt);
    console.log(`[FAL] Stickman lead (${sceneName}): ${fluxPrompt.split('\n\n')[0].slice(0, 220).replace(/\s+/g, ' ')}...`);
    console.log(`Generating image for scene: ${sceneName} (model: ${FLUX_MODEL}, endpoint: ${fluxEndpoint.replace(/^(https?:\/\/[^/]+).*/, '$1')})`);
    const imageSize = { width: TARGET_WIDTH, height: TARGET_HEIGHT };
    let body;
    if (isFlux2OrPro11) {
        body = {
            prompt: fluxPrompt,
            image_size: imageSize,
            output_format: 'png',
            enable_safety_checker: true
        };
        if (FLUX_MODEL === 'pro11') {
            body.enhance_prompt = true;
        }
    } else {
        body = {
            prompt: fluxPrompt,
            image_size: imageSize,
            num_inference_steps: numInferenceSteps,
            guidance_scale: FLUX_MODEL === 'schnell' ? 4.5 : 3.5,
            seed: falSeedForScene(sceneName, fluxPrompt),
            num_images: 1,
            enable_safety_checker: true,
            output_format: 'png',
        };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FAL_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(fluxEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => '(unreadable)');
        throw new Error(`Flux API Request Failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const imageUrl = data.images?.[0]?.url;

    if (!imageUrl) {
        throw new Error('No image URL returned from Flux API');
    }

    if (data.seed != null) {
        console.log(`[FAL] Response seed: ${data.seed}`);
    }

    console.log(`[FAL] Downloading image from CDN...`);

    const dlController = new AbortController();
    const dlTimeout = setTimeout(() => dlController.abort(), 30000);
    let imageResponse;
    try {
        imageResponse = await fetch(imageUrl, { signal: dlController.signal });
    } finally {
        clearTimeout(dlTimeout);
    }
    if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = Date.now();
    const baseName = `${safeSceneName}_${timestamp}`;
    const originalPath = path.join(imagesDir(), `${baseName}_raw.png`);
    const finalPath = path.join(imagesDir(), `${baseName}.png`);

    fs.writeFileSync(originalPath, buffer);

    const fullHdBuffer = await frameImageForVideo(buffer);
    fs.writeFileSync(finalPath, fullHdBuffer);
    console.log(`[FAL] Saved ${finalPath} (${TARGET_WIDTH}x${TARGET_HEIGHT})`);

    return finalPath;
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
