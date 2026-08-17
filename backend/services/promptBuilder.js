/**
 * Builds the full image prompt for one scene.
 * Uses the whole-script visual plan so each frame is conceptual and consistent.
 */

const { generateScenePrompt, buildFinalImagePrompt } = require('./scenePromptGenerator');
const { NEGATIVE_PROMPT } = require('../config/imageStyleGuide');

const FALLBACK_SCENE = 'sits on a sofa with a laptop, dim living room, no captions';

/**
 * @param {string} sceneText
 * @param {{ sceneIndex?: number, sceneId?: string, visualPlan?: object, previousScenes?: Array }} options
 */
async function buildScenePrompt(sceneText, options = {}) {
    const previousScenes = Array.isArray(options.previousScenes) ? options.previousScenes : [];

    let prompt;
    try {
        prompt = await generateScenePrompt(sceneText || '', options);
    } catch (err) {
        console.error('Scene prompt generation failed, using fallback:', err.message);
        prompt = buildFinalImagePrompt(FALLBACK_SCENE, sceneText || '', null);
    }

    const sceneMemory = {
        character: 'Arjun',
        style: '2d_outline_infographic',
        cameraFraming: 'medium shot',
        concept: 'openai_generated',
        previousCount: previousScenes.length,
        roleInStory: options.visualPlan?.scenes?.[options.sceneIndex]?.roleInStory || null,
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
