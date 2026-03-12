/**
 * OpenAI-powered scene prompt generator.
 * Converts narration sentences into professional doodle infographic scene descriptions.
 * Enforces: doodle infographic, clean vector line, minimal flat design, blue/light theme, white background.
 */

const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-4o-mini';
const TEMPERATURE = 0.3;

const SYSTEM_PROMPT = `You are a professional storyboard artist for YouTube finance explainer videos.

Your task is to convert narration sentences into VISUAL SCENE DESCRIPTIONS for an image generation model.

The scene must visually represent the meaning of the sentence using objects, characters and infographic elements.

IMPORTANT STYLE REQUIREMENTS:

Use a professional doodle infographic style.

Visual style must include:
- clean vector line illustration
- minimal flat design
- blue and light color palette
- white background
- infographic icons
- conceptual visuals

Scene composition:
- narrator character explaining concept
- large visual elements that represent the idea
- minimal background clutter
- objects interacting with characters

Narrator character description (must stay consistent across scenes):

young adult male explainer,
short brown hair,
light beard,
wearing dark sweater and pants,
friendly professional appearance

Avoid:
- kids cartoon style
- colorful classroom animation style
- childish characters
- exaggerated cartoon faces

The output must be a clear visual scene description suitable for generating an infographic explainer frame.
Describe sharp, in-focus visuals only—never soft, blurred, or out-of-focus imagery.`;

const NARRATOR_AND_STYLE_BLOCK = `consistent explainer narrator character: young adult male, short brown hair, light beard, dark sweater and pants,

doodle infographic explainer illustration,
clean vector line style,
minimal flat design,
blue and light color theme,
white background,
financial infographic icons,
professional youtube explainer scene,
conceptual visual storytelling,
sharp focus,
crisp clear details,
high clarity,
in focus`;

const FALLBACK_SCENE = 'narrator at desk with laptop and financial charts, minimal infographic elements, white background';

/**
 * Builds the final image prompt from the generated scene visual (narrator + style).
 * @param {string} sceneVisual - Raw scene description from OpenAI.
 * @returns {string} Full image prompt for the image API.
 */
function buildFinalImagePrompt(sceneVisual) {
    const visual = (sceneVisual && sceneVisual.trim()) ? sceneVisual.trim() : FALLBACK_SCENE;
    return `${visual},

${NARRATOR_AND_STYLE_BLOCK}`;
}

/**
 * Calls OpenAI to get a visual scene description, then builds the full image prompt.
 * @param {string} sentence - Narration text for the scene.
 * @returns {Promise<string>} Full image prompt (scene + narrator + style block).
 */
async function generateScenePrompt(sentence) {
    const trimmed = (sentence && typeof sentence === 'string') ? sentence.trim() : '';

    const userPrompt = `Convert this narration sentence into a visual scene description.

Sentence:
"${trimmed || 'Someone explaining a financial concept.'}"

Requirements:

The scene must:
- clearly represent the meaning of the sentence
- include the narrator character if explanation is needed
- use infographic visual metaphors when possible
- show objects and concepts visually

Return only the scene description.
Do not explain anything.`;

    let sceneVisual;
    try {
        const response = await openai.chat.completions.create({
            model: MODEL,
            temperature: TEMPERATURE,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ]
        });

        const content = response.choices[0]?.message?.content;
        sceneVisual = (content && typeof content === 'string' && content.trim().length > 0)
            ? content.trim()
            : FALLBACK_SCENE;
    } catch (err) {
        console.error('OpenAI scene prompt generation failed, using fallback:', err.message);
        sceneVisual = FALLBACK_SCENE;
    }

    const imagePrompt = buildFinalImagePrompt(sceneVisual);

    console.log('Scene sentence:', trimmed || '(empty)');
    console.log('Generated scene:', sceneVisual);
    console.log('Final image prompt:', imagePrompt);

    return imagePrompt;
}

module.exports = {
    generateScenePrompt,
    buildFinalImagePrompt
};
