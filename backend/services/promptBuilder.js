/**
 * Builds the full image prompt for one scene.
 * Uses the whole-script visual plan so each frame is conceptual and consistent.
 */

const { generateScenePrompt, buildFinalImagePrompt, buildNarrationDrivenFallback } = require('./scenePromptGenerator');
const { NEGATIVE_PROMPT } = require('../config/imageStyleGuide');

const FALLBACK_SCENE = buildNarrationDrivenFallback('');

/**
 * @param {string} sceneText
 * @param {{ sceneIndex?: number, sceneId?: string, visualPlan?: object, previousScenes?: Array }} options
 */
async function buildScenePrompt(sceneText, options = {}) {
    const previousScenes = Array.isArray(options.previousScenes) ? options.previousScenes : [];

    let imagePrompt;
    let sceneVisual = null;
    try {
        const result = await generateScenePrompt(sceneText || '', options);
        imagePrompt = result.imagePrompt;
        sceneVisual = result.sceneVisual;
    } catch (err) {
        console.error('Scene prompt generation failed, using fallback:', err.message);
        imagePrompt = buildFinalImagePrompt(FALLBACK_SCENE, sceneText || '', null);
        sceneVisual = FALLBACK_SCENE;
    }

    const planned = options.visualPlan?.scenes?.[options.sceneIndex] || null;
    const sceneMemory = {
        character: 'Stickman',
        style: 'stickman_doodle_infographic',
        cameraFraming: 'medium shot',
        concept: 'openai_generated',
        previousCount: previousScenes.length,
        roleInStory: planned?.roleInStory || options.visualPlan?.scenes?.[options.sceneIndex]?.roleInStory || null,
        narration: String(sceneText || '').slice(0, 160),
        setting: planned?.setting || null,
        sceneVisual: sceneVisual ? String(sceneVisual).slice(0, 500) : null,
    };
    return {
        prompt: imagePrompt,
        negativePrompt: NEGATIVE_PROMPT,
        sceneMemory,
    };
}

module.exports = {
    buildScenePrompt,
    NEGATIVE_PROMPT
};
