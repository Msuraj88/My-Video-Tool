/**
 * Google Vertex AI Imagen 3 image generation.
 * Uses text-only prompt generation — no reference image files.
 * Character consistency is maintained entirely through prompt engineering.
 */

const fs = require('fs');
const path = require('path');
const { getKeyPath, getGoogleAccessToken } = require('../utils/googleAuth');
const { frameImageForVideo, TARGET_WIDTH, TARGET_HEIGHT } = require('../utils/imageFraming');

const fetchFn = typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : require('node-fetch');

const tempImagesDir = path.join(__dirname, '../temp/images');
if (!fs.existsSync(tempImagesDir)) {
    fs.mkdirSync(tempImagesDir, { recursive: true });
}

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const STANDARD_MODEL_ID = 'imagen-3.0-generate-001';
const FAST_MODEL_ID = 'imagen-3.0-fast-generate-001';

const DEFAULT_NEGATIVE_PROMPT = `photorealistic, 3D render, realistic photo, gradients, complex shading, plain background, two people, duplicate character, text on image, watermark, distorted face`;

function getModelId() {
    return (process.env.IMAGEN_QUALITY || 'standard').toLowerCase() === 'fast'
        ? FAST_MODEL_ID
        : STANDARD_MODEL_ID;
}

function buildVertexPayload(prompt, negativePrompt) {
    const modelId = getModelId();
    return {
        modelId,
        payload: {
            instances: [
                {
                    prompt: String(prompt || '').trim()
                }
            ],
            parameters: {
                sampleCount: 1,
                negativePrompt: negativePrompt || DEFAULT_NEGATIVE_PROMPT,
                language: 'en',
                aspectRatio: '16:9',
                addWatermark: false
            }
        }
    };
}

/**
 * Calls Vertex AI Imagen 3. Prompt comes from our pipeline (scenePromptGenerator + style).
 *
 * @param {string} prompt - Full image prompt from our pipeline.
 * @param {string} sceneName - Scene id for filenames.
 * @param {{ negativePrompt?: string }} [options]
 * @returns {Promise<string>} - Path to saved 1920x1080 PNG.
 */
async function generateAndSaveSceneImageGoogle(prompt, sceneName, options = {}) {
    if (!PROJECT_ID) {
        throw new Error('GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_PROJECT environment variable is required for Google Imagen.');
    }

    if (!getKeyPath()) {
        throw new Error('Service account key not found. Set GOOGLE_APPLICATION_CREDENTIALS or place the JSON key in backend/.');
    }

    const negativePrompt = (options.negativePrompt && options.negativePrompt.trim()) || DEFAULT_NEGATIVE_PROMPT;
    const { modelId, payload } = buildVertexPayload(prompt, negativePrompt);

    try {
        console.log(`Generating image using Google Imagen (${modelId})...`);
        console.log(`Scene: ${sceneName}`);

        const accessToken = await getGoogleAccessToken();
        const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${modelId}:predict`;

        const response = await fetchFn(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const responseBody = await response.text();
        if (!response.ok) {
            console.error('Vertex Imagen API error - HTTP status:', response.status);
            console.error('Vertex Imagen API error - response body:', responseBody);
            throw new Error(`Vertex Imagen API failed: ${response.status} - ${responseBody}`);
        }

        const data = JSON.parse(responseBody);
        if (!data.predictions || data.predictions.length === 0) {
            console.error('Vertex Imagen API - unexpected response (no predictions):', JSON.stringify(data));
            throw new Error('No predictions returned from Vertex Imagen');
        }

        const pred = data.predictions[0];
        const bytesBase64 = pred.bytesBase64Encoded || pred.bytesBase64;
        if (!bytesBase64) {
            console.error('Vertex Imagen API - missing image data. Keys received:', JSON.stringify(Object.keys(pred || {})));
            throw new Error('Imagen response missing bytesBase64');
        }

        const buffer = Buffer.from(bytesBase64, 'base64');
        const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const baseName = `${safeSceneName}_google_${Date.now()}`;
        const finalPath = path.join(tempImagesDir, `${baseName}.png`);

        const framedBuffer = await frameImageForVideo(buffer);
        fs.writeFileSync(finalPath, framedBuffer);
        console.log(`Saved Google Imagen image to ${finalPath} (${TARGET_WIDTH}x${TARGET_HEIGHT})`);

        return finalPath;
    } catch (error) {
        console.error(`Google Imagen error for ${sceneName}:`, error.message);
        throw error;
    }
}

module.exports = {
    generateAndSaveSceneImageGoogle,
};
