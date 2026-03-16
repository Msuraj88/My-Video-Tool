/**
 * OpenAI-powered scene prompt generator.
 * Converts narration into rich visual scene descriptions.
 *
 * Target style: premium animated cartoon, like bitmoji or animated explainer series.
 * - Character fully integrated into a scene-appropriate environment.
 * - Dynamic poses and expressions that match the narration mood.
 * - Rich detailed backgrounds, not plain/solid colour.
 * - Full-bleed 16:9 composition, no patches or panels.
 */

const OpenAI = require('openai');
const { description: CHARACTER_DESCRIPTION } = require('../config/characterProfile');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-4o-mini';
const TEMPERATURE = 0.4;

const SYSTEM_PROMPT = `You are a storyboard director for a premium animated explainer video series. Your job is to write ONE vivid, detailed visual scene description for each narration line. The image generator will use your description to create a polished animated cartoon scene.

TARGET ART STYLE:
- Premium 2D animated cartoon quality, similar to professional animated YouTube explainer series or Bitmoji Adventures.
- Bold clean black outlines on all characters and objects.
- Smooth flat shading with subtle shadows and highlights.
- Vibrant, rich colours – not dull or washed out.
- Fully detailed scene-appropriate environment, NOT a plain white or grey background.
- The illustration fills the entire 16:9 frame edge to edge. No borders. No panels.

THE CHARACTER:
${CHARACTER_DESCRIPTION}
- He is the ONLY person in every scene. Never two characters, never duplicated.
- He is fully integrated INTO the environment – not floating in front of a plain background.
- His EXPRESSION and POSE must match the mood of THIS specific scene (see pose guide below).

POSE AND EXPRESSION GUIDE – vary these to match the narration mood:
- Explaining concept → standing, one hand open-palm gesture toward the key visual element, neutral/warm smile.
- Revealing something important → wide eyes, one eyebrow raised, leaning slightly forward, pointing finger at object.
- Positive outcome or achievement → confident wide smile, arms spread open or fist raised, upright posture.
- Warning / deadline / risk → serious focused expression, one hand raised palm-out as a stop gesture, or pointing directly at a warning symbol.
- Thinking / considering options → hand on chin, slightly tilted head, eyes looking at the choices displayed around him.
- Presenting or showing data → holding or gesturing toward a floating chart, tablet, or visual panel beside him.
- Excited / enthusiastic → leaning into camera, big grin, both hands gesturing outward.

SCENE ENVIRONMENT GUIDE – choose the environment that best fits the narration topic:
- Finance / money / banking → modern bank interior or sleek open-plan office with city skyline view through glass windows.
- Saving / goals / future → warm living room, outdoor park or garden, or bright clean home.
- Deadlines / dates / calendar → clean home office desk, wall calendar in background, clocks.
- Choices / decisions / options → crossroads in a road, three doors, branching path.
- Debt / credit / cards → financial office, credit card graphics in environment, abstract financial space.
- Shopping / spending → retail store interior, mall corridor, or colorful product displays.
- Investment / growth → stock exchange floor, ascending bar-chart environment, green financial landscape.
- Steps / processes → numbered path, staircase, or milestone road.
- Achievement / success → podium, trophy, city skyline celebrating moment.
- General explanation → modern studio or classroom with whiteboard or large display screen.

BACKGROUND AND PROPS:
- Background must be a FULL ILLUSTRATED ENVIRONMENT, not a solid colour. Show walls, windows, furniture, or outdoor scenery.
- Include 3–6 scene-relevant props around the character that visually represent the narration concepts.
- Props should be large, clear and recognisable (credit card shape, piggy bank, calendar with circled date, stack of bills, glowing chart, shield, etc.).
- Use illustrated floating elements, connected by arrows or visual lines where helpful, to show relationships between concepts.
- Props fill the left side, right side, or background so the whole frame is used.

CRITICAL RULES:
1. NO TEXT, NUMBERS, OR LABELS in the image. Describe shapes and objects only (e.g. "calendar with one date circled", NOT "calendar showing '15th'"). All text is added later as overlay.
2. ONE character only. Never "same character twice", never "two people".
3. FULL-BLEED: background extends to all four edges. No central panel, no patch, no inset, no frame within a frame.
4. Character must be IN the scene environment – standing on a floor, in a room, outdoors, not floating.
5. Output ONLY the scene description. No intro, no meta-commentary, no formatting.`;

const CHARACTER_STYLE_BLOCK = `CARTOON CHARACTER (same every scene): ${CHARACTER_DESCRIPTION}

ART DIRECTION: Premium 2D animated cartoon, animated explainer series quality. Bold outlines, smooth flat shading, vibrant rich colours. Character in a fully illustrated environment — NOT plain background. Scene fills entire frame edge to edge. No text, numbers, or labels on any element.`;

const FALLBACK_SCENE = 'The cartoon narrator stands in a modern open-plan office with floor-to-ceiling windows showing a city skyline. He holds an open laptop toward the viewer, smiling confidently. Colourful floating icons and document shapes surround him. Warm lighting from the windows.';

/**
 * Builds the final image prompt from the generated scene visual.
 */
function buildFinalImagePrompt(sceneVisual) {
    const visual = (sceneVisual && sceneVisual.trim()) ? sceneVisual.trim() : FALLBACK_SCENE;
    return `${visual}

${CHARACTER_STYLE_BLOCK}`;
}

/**
 * Calls OpenAI to get a visual scene description, then builds the full image prompt.
 * @param {string} sentence - Narration text for this scene.
 * @returns {Promise<string>} - Full image prompt ready for Imagen.
 */
async function generateScenePrompt(sentence) {
    const trimmed = (sentence && typeof sentence === 'string') ? sentence.trim() : '';

    const userPrompt = `Write ONE detailed visual scene description for the narration below. Follow all the rules in your instructions.

NARRATION: "${trimmed || 'An instructor explains a key concept to the viewer.'}"

WHAT TO INCLUDE IN YOUR DESCRIPTION:
1. ENVIRONMENT: Name a specific illustrated setting that fits this topic (office, home, outdoor, financial space, etc.) — include background details (walls, windows, scenery, furniture, lighting). NOT a plain background.
2. CHARACTER POSE + EXPRESSION: Describe exactly how the character looks and what he is doing in this moment — his body position, hand gesture, facial expression, and what he is interacting with. Match the mood of the narration.
3. PROPS AND CONCEPT VISUALS: List 3–6 large clear props or illustrated elements that represent the core concepts in the narration. Place them around the character to fill the frame. Show connections (arrows, grouping) between related objects.
4. FULL-BLEED COMPOSITION: Character and all elements fill the entire frame left-to-right, top-to-bottom. No empty areas. No central panel or patch.

RULES:
- No text, numbers, or labels on any object. Shape and visual only.
- One character only. Same guy every scene.
- Rich illustrated background (not solid colour).
- Output the description only. No preamble.`;

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

    console.log('Scene narration:', trimmed || '(empty)');
    console.log('Generated scene visual:', sceneVisual);

    return imagePrompt;
}

module.exports = {
    generateScenePrompt,
    buildFinalImagePrompt
};
