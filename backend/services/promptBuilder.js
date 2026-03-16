/**
 * Builds the full prompt and scene memory for one scene.
 * Pipeline: script sentence → OpenAI Scene Prompt Generator (doodle infographic style) → image prompt.
 * CRITICAL: No text or numbers in the prompt — image model must not render text.
 */

const { generateScenePrompt, buildFinalImagePrompt } = require('./scenePromptGenerator');
const { NEGATIVE_PROMPT } = require('../config/imageStyleGuide');

const NO_TEXT_REMINDER = ' No text, numbers, or words anywhere in the image. No labels on any object. Single character only — never duplicate the character. Full-bleed composition: the illustration fills the entire frame edge to edge, no bordered panel, no patch, no inset. Character stands in a fully illustrated environment — NOT a plain or solid colour background. Dense composition, no large empty areas. Premium 2D animated cartoon quality with bold outlines and vibrant colours.';

const FALLBACK_SCENE = 'narrator at desk with laptop and financial charts, minimal infographic elements, white background';

/**
 * Builds the full prompt and scene memory for one scene.
 * OpenAI generator returns the full image prompt (scene + narrator + style); we only add no-text reminder.
 *
 * @param {string} sceneText - The narration for the scene.
 * @param {{ sceneIndex?: number, previousScenes?: Array }} options - Optional scene index and memory.
 * @returns {Promise<{ prompt: string, negativePrompt: string, sceneMemory: object }>}
 */
async function buildScenePrompt(sceneText, options = {}) {
    const previousScenes = Array.isArray(options.previousScenes) ? options.previousScenes : [];

    let prompt;
    try {
        prompt = await generateScenePrompt(sceneText || '');
    } catch (err) {
        console.error('Scene prompt generation failed, using fallback:', err.message);
        prompt = buildFinalImagePrompt(FALLBACK_SCENE);
    }

    prompt = prompt + NO_TEXT_REMINDER;

    const sceneMemory = {
        environment: 'white background',
        mainObject: 'scene focus',
        cameraFraming: 'medium shot',
        concept: 'openai_generated'
    };

    return {
        prompt,
        negativePrompt: NEGATIVE_PROMPT,
        sceneMemory
    };
}

module.exports = {
    buildScenePrompt,
    NEGATIVE_PROMPT
};
