/**
 * Story + stickman image prompt assembly.
 * Scene-specific content leads; style rules follow in compact form.
 */

const { FAL_STYLE_ANCHOR } = require('../config/imageStyleGuide');
const {
    STICKMAN_MANDATE,
    CHARACTER_SHORT,
    sanitizeSceneVisual,
} = require('./stickmanPrompt');

const CONCEPT_MANDATE = `Draw ONLY what the current scene narration describes. Use natural visual storytelling through characters, pose, and environment — not financial infographic boards unless this narration explicitly mentions money, savings, income, or finance.`;

const VISUAL_STORYBOARD_RULE = `Show only what this scene narration says. Named characters appear together when the narration describes them together.`;

const VISUAL_SIMPLICITY_RULE = `One clear primary subject, 2-5 meaningful elements, characters carry the story when possible.`;

const NO_TEXT_MANDATE = `Full-color pictorial scene with no writing, lettering, numbers, or text-like symbols anywhere. Communicate meaning only through colorful characters, poses, objects, and environment.`;

function buildTextMandate(label) {
    if (!label) return NO_TEXT_MANDATE;
    return `One visible label only: "${label}", spelled correctly in bold uppercase sans-serif on the most relevant object. No other writing anywhere.`;
}

function extractStorySections(fullPrompt) {
    const text = String(fullPrompt || '').trim();
    return {
        narration: text.match(/NARRATION TO VISUALIZE: ([^\n]+)/)?.[1]?.trim() || '',
        characters: text.match(/CHARACTERS: ([^\n]+)/)?.[1]?.trim() || '',
        action: text.match(/ACTION: ([^\n]+)/)?.[1]?.trim() || '',
        environment: text.match(/ENVIRONMENT: ([^\n]+)/)?.[1]?.trim() || '',
        storyBeat: text.match(/STORY BEAT: ([^\n]+)/)?.[1]?.trim() || '',
        visualMetaphor: text.match(/VISUAL METAPHOR: ([^\n]+)/)?.[1]?.trim() || '',
        conceptObjects: text.match(/SCENE ELEMENTS \(only from this narration\): ([^\n]+)/)?.[1]?.trim()
            || text.match(/CONCEPT OBJECTS \(must appear in frame\): ([^\n]+)/)?.[1]?.trim() || '',
        sceneBlock: text.match(/SCENE:\s*([\s\S]*?)(?:\n\nConsistency:|$)/)?.[1]?.trim()
            || text.match(/SCENE \([^)]*\):\s*([\s\S]*?)(?:\n\nConsistency:|$)/)?.[1]?.trim() || '',
        onImageLabel: text.match(/VISIBLE TEXT[^:]*: "([^"]*)"/)?.[1]?.trim()
            || text.match(/ON-IMAGE TEXT[^:]*: "([^"]*)"/)?.[1]?.trim() || '',
    };
}

function buildStoryLead(sections) {
    const {
        characters, action, environment,
        storyBeat, visualMetaphor, conceptObjects, sceneBlock,
    } = sections;
    const safeScene = sceneBlock ? sanitizeSceneVisual(sceneBlock) : '';

    return [
        characters && `Characters: ${characters}.`,
        action && `Action: ${action}.`,
        environment && `Environment: ${environment}.`,
        storyBeat && `Story beat: ${storyBeat}.`,
        visualMetaphor && `Visual focus: ${visualMetaphor}.`,
        conceptObjects && `Include: ${conceptObjects}.`,
        safeScene,
    ].filter(Boolean).join(' ');
}

function buildStyleBlock(label) {
    return [
        FAL_STYLE_ANCHOR,
        `Stickman style: ${CHARACTER_SHORT}.`,
        'Horizontal 16:9, full-color hand-drawn 2D explainer illustration with warm muted tones and accent colors, simple visible environment with ground line.',
        label ? `Only visible writing: "${label}".` : 'No writing anywhere — communicate only through colorful drawings.',
    ].filter(Boolean).join(' ');
}

/** Avoid list uses only non-text priming terms — never mention scripts or lettering. */
function buildStickmanAvoidList(negativePrompt, label) {
    const base = [
        'black and white', 'grayscale', 'monochrome', 'sepia',
        'financial infographic', 'presentation board', 'stock charts', 'cluttered infographic',
        'plain solid color background', 'realistic human', 'detailed cartoon face', 'vector character with hair',
        'photorealistic', '3D render', 'watermark',
    ];
    const textPriming = /\b(text|letter|caption|subtitle|devanagari|hindi|script|writing|signage|label|headline|typography|gibberish|fake)\b/i;
    const extra = negativePrompt
        ? String(negativePrompt).split('\n').map((s) => s.trim()).filter((s) => s && !textPriming.test(s)).slice(0, 6)
        : [];
    return [...new Set([...base, ...extra])].join(', ');
}

/**
 * Scene-specific content FIRST so FLUX weights the narration beat over shared rules.
 */
function buildStoryFirstPrompt(fullPrompt, options = {}) {
    const sections = extractStorySections(fullPrompt);
    const label = sections.onImageLabel || null;
    const storyLead = buildStoryLead(sections);
    const styleBlock = buildStyleBlock(label);
    const rules = [CONCEPT_MANDATE, VISUAL_STORYBOARD_RULE, VISUAL_SIMPLICITY_RULE, STICKMAN_MANDATE].join(' ');
    const textRule = buildTextMandate(label);
    const avoid = `Avoid: ${buildStickmanAvoidList(options.negativePrompt, label)}`;

    return [storyLead, styleBlock, rules, textRule, avoid].filter(Boolean).join(' ');
}

module.exports = {
    extractStorySections,
    buildStoryFirstPrompt,
    buildStoryLead,
    buildTextMandate,
    CONCEPT_MANDATE,
    VISUAL_STORYBOARD_RULE,
    VISUAL_SIMPLICITY_RULE,
    NO_TEXT_MANDATE,
};
