/**
 * Google Vertex AI image generation via Gemini 2.5 Flash Image.
 * Character consistency is maintained entirely through prompt engineering.
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenAI, Modality } = require('@google/genai');
const { getKeyPath } = require('../utils/googleAuth');
const { frameImageForVideo, TARGET_WIDTH, TARGET_HEIGHT } = require('../utils/imageFraming');
const { imagesDir } = require('../utils/tempDirs');
const { buildStoryFirstPrompt } = require('../utils/storyPromptBuilder');
const { getCharacterReferenceImages } = require('../utils/characterReference');

const MODEL_ID = 'gemini-2.5-flash-image';

const DEFAULT_NEGATIVE_PROMPT = `gibberish text, fake letters, garbled writing, misspelled words, random characters, paragraphs of text, sentences, captions, subtitles, cluttered text everywhere, text on every object, Chinese characters, Japanese characters, Devanagari, Hindi script, empty blank background, plain solid color only, characters alone with no props, character portrait only, photorealistic, 3D render, realistic human, detailed cartoon man, detailed cartoon woman, vector character with hair, facial features, beard, jeans, suit jacket, webtoon character, anime character, watermark`;

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND']);
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);
const PERMANENT_HTTP = new Set([400, 401, 403, 404]);
const RETRY_DELAYS_MS = [2000, 5000, 10000];
const MAX_ATTEMPTS = 3;

function getProjectId() {
    return process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
}

function getLocation() {
    return process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
}

function resolveCredentialPath() {
    const raw = getKeyPath();
    if (!raw) return null;
    return path.isAbsolute(raw) ? raw : path.resolve(__dirname, '..', raw);
}

function buildPrompt(scenePrompt, negativePrompt) {
    return buildStoryFirstPrompt(scenePrompt, { negativePrompt, compactStyle: false });
}

function buildContents(textPrompt) {
    const refs = getCharacterReferenceImages();
    if (!refs.length) {
        return [{ role: 'user', parts: [{ text: textPrompt }] }];
    }

    console.log(`[GOOGLE IMAGE] Using stickman reference: ${refs[0].path}`);
    return [{
        role: 'user',
        parts: [
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: refs[0].bytesBase64Encoded,
                },
            },
            {
                text: `CHARACTER REFERENCE — copy this exact stick figure design for every person in the scene (round head, stick limbs, waistcoat, bow tie). Never draw a detailed vector human or cartoon person with hair. Ignore any lettering in the reference image; follow only the text rule stated below.\n\n${textPrompt}`,
            },
        ],
    }];
}

function extractStatus(err) {
    const status = err?.status || err?.code || err?.statusCode || err?.cause?.status;
    if (typeof status === 'number') return status;
    if (typeof status === 'string' && /^\d+$/.test(status)) return parseInt(status, 10);
    const match = String(err?.message || '').match(/\b(400|401|403|404|429|500|502|503|504)\b/);
    return match ? parseInt(match[1], 10) : null;
}

function extractCauseCode(err) {
    return err?.cause?.code || err?.code || '';
}

function isTransientError(err) {
    const status = extractStatus(err);
    if (status && TRANSIENT_HTTP.has(status)) return true;
    if (status && PERMANENT_HTTP.has(status)) return false;
    const code = extractCauseCode(err);
    if (TRANSIENT_CODES.has(code)) return true;
    return /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(String(err?.message || ''));
}

function describeApiError(err, location) {
    const status = extractStatus(err);
    const original = err?.message || String(err);
    if (status === 403) {
        return `Google image generation 403 (permission). Reason: ${original}`;
    }
    if (status === 404) {
        return [
            'Google image generation 404 NOT_FOUND.',
            `Check model name (${MODEL_ID}), Vertex generateContent endpoint, region (${location}), and API version.`,
            `Original: ${original}`,
        ].join(' ');
    }
    if (status) {
        return `Google image generation failed (${status}): ${original}`;
    }
    return `Google image generation failed: ${original}`;
}

function extractImageBuffer(response) {
    const parts = response?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
        for (const part of parts) {
            const inline = part?.inlineData || part?.inline_data;
            if (!inline?.data) continue;
            if (Buffer.isBuffer(inline.data)) return inline.data;
            if (inline.data instanceof Uint8Array) return Buffer.from(inline.data);
            return Buffer.from(inline.data, 'base64');
        }
    }
    if (response?.data) {
        if (Buffer.isBuffer(response.data)) return response.data;
        if (response.data instanceof Uint8Array) return Buffer.from(response.data);
        if (typeof response.data === 'string') return Buffer.from(response.data, 'base64');
    }
    return null;
}

function createClient(projectId, location, credentialPath) {
    return new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location,
        googleAuthOptions: {
            keyFilename: credentialPath,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        },
    });
}

async function generateOnce(client, contents) {
    return client.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
            responseModalities: [Modality.TEXT, Modality.IMAGE],
            imageConfig: {
                aspectRatio: '16:9',
            },
        },
    });
}

/**
 * Calls Gemini 2.5 Flash Image on Vertex AI. Prompt comes from our pipeline.
 *
 * @param {string} prompt - Full image prompt from our pipeline.
 * @param {string} sceneName - Scene id for filenames.
 * @param {{ negativePrompt?: string }} [options]
 * @returns {Promise<string>} - Path to saved 1280x720 PNG.
 */
async function generateAndSaveSceneImageGoogle(prompt, sceneName, options = {}) {
    const projectId = getProjectId();
    const location = getLocation();
    const credentialPath = resolveCredentialPath();

    if (!projectId) {
        throw new Error('GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_PROJECT environment variable is required for Google image generation.');
    }
    if (!credentialPath || !fs.existsSync(credentialPath)) {
        throw new Error('Service account key not found. Set GOOGLE_APPLICATION_CREDENTIALS or place the JSON key in backend/.');
    }

    const negativePrompt = (options.negativePrompt && options.negativePrompt.trim()) || DEFAULT_NEGATIVE_PROMPT;
    const textPrompt = buildPrompt(prompt, negativePrompt);
    const contents = buildContents(textPrompt);
    const storyLead = textPrompt.split('\n\n')[0] || '';
    console.log(`[GOOGLE IMAGE] Stickman lead (${sceneName}): ${storyLead.slice(0, 220).replace(/\s+/g, ' ')}...`);
    const client = createClient(projectId, location, credentialPath);

    console.log(`[GOOGLE IMAGE] Model: ${MODEL_ID}`);
    console.log(`[GOOGLE IMAGE] Project: ${projectId}`);
    console.log(`[GOOGLE IMAGE] Location: ${location}`);
    console.log(`[GOOGLE IMAGE] Scene: ${sceneName}`);
    console.log('[GOOGLE IMAGE] Generating...');

    let lastError;
    let response;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            response = await generateOnce(client, contents);
            break;
        } catch (err) {
            lastError = err;
            const status = extractStatus(err);
            console.error(`[GOOGLE IMAGE] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${describeApiError(err, location)}`);
            if (!isTransientError(err) || attempt === MAX_ATTEMPTS) {
                const wrapped = new Error(describeApiError(err, location));
                wrapped.cause = err;
                if (status) wrapped.status = status;
                throw wrapped;
            }
            const delay = RETRY_DELAYS_MS[attempt - 1] || 10000;
            console.log(`[GOOGLE IMAGE] Retrying in ${delay / 1000}s...`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }

    const buffer = extractImageBuffer(response);
    if (!buffer || !buffer.length) {
        throw new Error('Google image generation returned no image data in Gemini response parts.');
    }

    console.log('[GOOGLE IMAGE] Generated successfully');

    const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const baseName = `${safeSceneName}_google_${Date.now()}`;
    const finalPath = path.join(imagesDir(), `${baseName}.png`);
    const framedBuffer = await frameImageForVideo(buffer);
    fs.writeFileSync(finalPath, framedBuffer);
    console.log(`[GOOGLE IMAGE] Saved: ${finalPath} (${TARGET_WIDTH}x${TARGET_HEIGHT})`);
    return finalPath;
}

module.exports = {
    generateAndSaveSceneImageGoogle,
};
