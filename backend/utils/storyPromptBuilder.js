/**
 * Story + stickman image prompt assembly.
 * Conceptual objects and narration lead; stickman character is locked but never
 * the only thing in the frame.
 */

const { FAL_STYLE_ANCHOR } = require('../config/imageStyleGuide');
const {
    STICKMAN_MANDATE,
    CHARACTER_SHORT,
    sanitizeSceneVisual,
} = require('./stickmanPrompt');

const CONCEPT_MANDATE = `CONCEPTUAL STORY MANDATE — the image MUST show the narration idea with large visible metaphor objects, icons, shapes, and a clear setting. Stickman is part of the scene, NEVER alone on a blank background. Fill the frame: character + 2–4 big concept objects (coin stacks, growth curves, piggy banks, calendars, arrows, comparison panels, thought bubbles with symbols). Empty solid-color backgrounds with only characters are FORBIDDEN.`;

const NO_TEXT_MANDATE = `NO TEXT — this image contains zero written words, letters, digits, captions, or signage. No Devanagari, no Chinese, no Japanese, no fake or gibberish lettering. Explain everything through drawings: symbols, icons, coin stacks, arrows, charts, expression, and pose.`;

/**
 * Diffusion models invent gibberish whenever writing is implied, so exactly one
 * short pre-approved label is permitted and every other glyph is forbidden.
 */
function buildTextMandate(label) {
    if (!label) return NO_TEXT_MANDATE;

    return `STRICT TEXT RULE — the image may contain EXACTLY ONE piece of text: "${label}". Render it exactly as written, spelled correctly, in clean bold uppercase sans-serif block letters, large and clearly readable, placed once on the single most relevant object (a chart, a jar, a screen, or a plain banner). ABSOLUTELY NO other text anywhere: no extra words, no sentences, no captions, no subtitles, no signage, no Devanagari, no Chinese, no Japanese, no random or gibberish letters, no watermark. If any other lettering would appear, leave that area blank instead. Everything else in the frame is explained by drawings only.`;
}

function extractStorySections(fullPrompt) {
    const text = String(fullPrompt || '').trim();
    return {
        narration: text.match(/NARRATION TO VISUALIZE: "([^"]*)"/)?.[1]?.trim() || '',
        storyBeat: text.match(/STORY BEAT: ([^\n]+)/)?.[1]?.trim() || '',
        visualMetaphor: text.match(/VISUAL METAPHOR: ([^\n]+)/)?.[1]?.trim() || '',
        conceptObjects: text.match(/CONCEPT OBJECTS \(must appear in frame\): ([^\n]+)/)?.[1]?.trim() || '',
        sceneBlock: text.match(/SCENE \([^)]*\):\s*([\s\S]*?)(?:\n\nConsistency:|$)/)?.[1]?.trim() || '',
        onImageLabel: text.match(/ON-IMAGE TEXT[^:]*: "([^"]*)"/)?.[1]?.trim() || '',
    };
}

function buildStoryLead(sections) {
    const { narration, storyBeat, visualMetaphor, conceptObjects, sceneBlock } = sections;
    const safeScene = sceneBlock ? sanitizeSceneVisual(sceneBlock) : '';

    return [
        narration && `Illustrate this narration moment: "${narration}"`,
        storyBeat && `The image must communicate: ${storyBeat}`,
        visualMetaphor && `Visual metaphor to draw: ${visualMetaphor}`,
        conceptObjects
            ? `REQUIRED large metaphor objects (must dominate the frame): ${conceptObjects}`
            : 'REQUIRED: invent 2–4 large metaphor objects that explain this narration (coin stacks, growth curves, arrows, calendars, containers).',
        safeScene && `Scene composition: ${safeScene}`,
        'Composition rule: Stickman stick figure reacts to / points at / stands among the concept objects. Objects take at least half the frame.',
    ].filter(Boolean).join('\n\n');
}

function buildStyleBlock(label) {
    return [
        FAL_STYLE_ANCHOR,
        `Character: ${CHARACTER_SHORT}. Same stick figure if multiple characters.`,
        '16:9 full-bleed explainer scene with a simplified but visible environment (not blank). Large flat icons and props explain the idea.',
        label
            ? `The only lettering in the whole image is the single label "${label}", spelled correctly in bold uppercase block letters.`
            : 'The illustration is completely wordless — no lettering anywhere.',
    ].filter(Boolean).join(' ');
}

function buildStickmanAvoidList(negativePrompt, label) {
    const base = [
        'gibberish text',
        'fake letters',
        'garbled writing',
        'misspelled words',
        'random characters',
        'nonsense lettering',
        'paragraphs of text',
        'sentences',
        'captions',
        'subtitles',
        'Chinese characters',
        'Japanese characters',
        'Korean characters',
        'Devanagari',
        'Hindi script',
        'cluttered text everywhere',
        'text on every object',
        'watermark',
        'logo',
        'empty blank background',
        'plain solid color only',
        'characters alone with no props',
        'no objects',
        'no icons',
        'character portrait only',
        'realistic human',
        'detailed cartoon man',
        'detailed cartoon woman',
        'vector character with hair',
        'corporate infographic person',
        'beard',
        'webtoon character',
        'anime character',
        '3D render',
        'photorealistic',
    ];

    if (!label) {
        base.unshift('text', 'letters', 'numbers', 'labels', 'signage');
    }

    const extra = negativePrompt
        ? String(negativePrompt).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12)
        : [];
    return [...new Set([...base, ...extra])].join(', ');
}

/**
 * @param {string} fullPrompt - Output of buildFinalImagePrompt
 * @param {{ negativePrompt?: string, compactStyle?: boolean }} [options]
 */
function buildStoryFirstPrompt(fullPrompt, options = {}) {
    const sections = extractStorySections(fullPrompt);
    const label = sections.onImageLabel || null;
    const storyLead = buildStoryLead(sections);
    const styleBlock = buildStyleBlock(label);
    const avoid = `Avoid: ${buildStickmanAvoidList(options.negativePrompt, label)}`;

    // Text rule first: diffusion models invent gibberish unless the allowed text is pinned down
    return [buildTextMandate(label), STICKMAN_MANDATE, CONCEPT_MANDATE, storyLead, styleBlock, avoid]
        .filter(Boolean)
        .join('\n\n');
}

module.exports = {
    extractStorySections,
    buildStoryFirstPrompt,
    buildStoryLead,
    buildTextMandate,
    CONCEPT_MANDATE,
    NO_TEXT_MANDATE,
};
