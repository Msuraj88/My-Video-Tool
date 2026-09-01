/**
 * Approved on-image label.
 *
 * Diffusion models render gibberish when a prompt implies free-form writing, so the
 * pipeline defaults to wordless images. A label is only permitted when the narration
 * explicitly requires visible text on screen.
 */

/** Figures stay legible when longer; long words are where models start misspelling. */
const MAX_FIGURE_LENGTH = 16;
const MAX_WORD_LENGTH = 12;

/** Narration must explicitly ask for visible writing — bare numbers/amounts do not qualify. */
const EXPLICIT_TEXT_PATTERNS = [
    /\b(screen|sign|board|poster|banner|label|title|caption|headline)\s+(shows?|reads?|says?|displays?|with)\b/i,
    /\b(shows?|reads?|says?|displays?|writes?)\s+(the\s+)?(text|word|title|label|caption|headline)\b/i,
    /\b(text|word|title|label|caption|headline)\s+(on|in)\s+(the\s+)?(screen|sign|board|poster|banner)\b/i,
    /\bvisible\s+(text|writing|label|caption|title)\b/i,
    /\bwritten\s+(on|in)\b/i,
    /\bthat\s+(reads?|says?)\s*["']/i,
];

/**
 * Returns true only when narration explicitly requires visible text in the image.
 * @param {string} narration
 * @returns {boolean}
 */
function narrationRequiresVisibleText(narration) {
    const line = String(narration || '').trim();
    if (!line) return false;
    return EXPLICIT_TEXT_PATTERNS.some((p) => p.test(line));
}

/** Keeps only characters an image model can spell reliably. */
function toRenderableAscii(value) {
    return String(value || '')
        .replace(/₹/g, 'Rs ')
        .replace(/[\u0900-\u097F]/g, '')       // Devanagari
        .replace(/[^A-Za-z0-9 ,.%$]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function withinLimit(label) {
    const limit = /\d/.test(label) ? MAX_FIGURE_LENGTH : MAX_WORD_LENGTH;
    return label.length >= 2 && label.length <= limit;
}

/** A label is only allowed if the narration actually contains those characters. */
function appearsInNarration(label, narration) {
    const haystack = toRenderableAscii(narration).toLowerCase().replace(/\s+/g, '');
    const needle = String(label).toLowerCase().replace(/\s+/g, '');
    return needle.length > 0 && haystack.includes(needle);
}

/** Extract quoted text the narration explicitly names for on-screen display. */
function extractExplicitQuotedText(narration) {
    const match = String(narration || '').match(/(?:reads?|says?|shows?|displays?|writes?)\s+"([^"]{1,16})"/i);
    if (!match) return null;
    const label = toRenderableAscii(match[1]).toUpperCase();
    return withinLimit(label) ? label : null;
}

/**
 * Picks the single label allowed on this scene's image, or null when the frame
 * should stay wordless (the default).
 *
 * @param {string} narration - Raw narration line for the scene.
 * @param {string|null} plannedLabel - Optional label proposed by the visual plan.
 * @returns {string|null} Uppercase ASCII label, or null.
 */
function buildApprovedLabel(narration, plannedLabel = null) {
    const line = String(narration || '');

    if (!narrationRequiresVisibleText(line)) return null;

    const quoted = extractExplicitQuotedText(line);
    if (quoted) return quoted;

    if (!plannedLabel) return null;

    const planned = toRenderableAscii(plannedLabel).toUpperCase();
    if (!planned || !withinLimit(planned)) return null;
    if (!appearsInNarration(planned, line)) return null;

    return planned;
}

/**
 * Strips labels from scenes that do not explicitly require visible text.
 *
 * @param {Array<{textOnImage?: string|null, concept?: string}>} plannedScenes
 * @param {Array<{text?: string}>} scenes
 * @returns {Array} plannedScenes with surplus labels removed
 */
function thinOutLabels(plannedScenes, scenes = []) {
    return plannedScenes.map((planned, index) => {
        const narration = scenes[index]?.text || '';
        if (!narrationRequiresVisibleText(narration)) {
            return { ...planned, textOnImage: null };
        }
        return { ...planned, textOnImage: buildApprovedLabel(narration, planned.textOnImage) };
    });
}

module.exports = {
    buildApprovedLabel,
    thinOutLabels,
    narrationRequiresVisibleText,
    toRenderableAscii,
    MAX_FIGURE_LENGTH,
    MAX_WORD_LENGTH,
};
