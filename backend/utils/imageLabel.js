/**
 * Approved on-image label.
 *
 * Diffusion models render gibberish when a prompt implies free-form writing, so the
 * pipeline permits at most ONE short label per image, derives it from the narration
 * itself, and only when the line genuinely needs a word highlighted. Most scenes get
 * no text at all — the drawing carries the meaning.
 */

/** Figures stay legible when longer; long words are where models start misspelling. */
const MAX_FIGURE_LENGTH = 16;
const MAX_WORD_LENGTH = 12;

/**
 * Only these terms are worth burning into a frame. Anything outside this list is
 * explained by the illustration instead, which keeps text rare and intentional.
 */
const HIGHLIGHT_TERMS = [
    'compound', 'interest', 'salary', 'income', 'savings', 'investment',
    'profit', 'loss', 'debt', 'loan', 'emi', 'budget', 'inflation', 'tax',
    'fame', 'followers', 'recognition', 'brand', 'growth', 'risk',
];

/** Currency and percentage figures, normalised so they render cleanly. */
function extractFigures(text) {
    const source = String(text || '');
    const found = [];

    const rupee = source.match(/₹\s*[\d,]+(?:\.\d+)?/g);
    if (rupee) found.push(...rupee.map((s) => s.replace(/\s+/g, '').replace('₹', 'Rs ')));

    const dollar = source.match(/\$\s*[\d,]+(?:\.\d+)?/g);
    if (dollar) found.push(...dollar.map((s) => s.replace(/\s+/g, '')));

    const percent = source.match(/\d+(?:\.\d+)?\s*%/g);
    if (percent) found.push(...percent.map((s) => s.replace(/\s+/g, '')));

    const grouped = source.match(/\b\d{1,3}(?:,\d{2,3})+\b/g);
    if (grouped) found.push(...grouped);

    return [...new Set(found)];
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

function findHighlightTerm(text) {
    const lower = String(text || '').toLowerCase();
    return HIGHLIGHT_TERMS.find((term) => new RegExp(`\\b${term}\\b`).test(lower)) || null;
}

/**
 * Picks the single label allowed on this scene's image, or null when the frame
 * should stay wordless.
 *
 * A figure (amount, percentage) always qualifies because numbers cannot be drawn
 * precisely. A word only qualifies when the visual plan asked for it AND it is a
 * recognised highlight term AND it literally appears in the narration.
 *
 * @param {string} narration - Raw narration line for the scene.
 * @param {string|null} plannedLabel - Optional label proposed by the visual plan.
 * @returns {string|null} Uppercase ASCII label, or null.
 */
function buildApprovedLabel(narration, plannedLabel = null) {
    const line = String(narration || '');

    const figure = extractFigures(line).map(toRenderableAscii).find((f) => f && withinLimit(f.toUpperCase()));
    if (figure) return figure.toUpperCase();

    if (!plannedLabel) return null;

    const planned = toRenderableAscii(plannedLabel).toUpperCase();
    if (!planned || !withinLimit(planned)) return null;
    if (!appearsInNarration(planned, line)) return null;
    if (!findHighlightTerm(planned)) return null;

    return planned;
}

/**
 * Text loses its impact when every frame carries a label, so labels are thinned out
 * across the timeline: never on consecutive scenes, and never on more than a third
 * of the video. Figures are kept because they carry information nothing else can.
 *
 * @param {Array<{textOnImage?: string|null, concept?: string}>} plannedScenes
 * @param {Array<{text?: string}>} scenes
 * @returns {Array} plannedScenes with surplus labels removed
 */
function thinOutLabels(plannedScenes, scenes = []) {
    const maxLabelled = Math.max(1, Math.ceil(plannedScenes.length / 3));
    let used = 0;
    let previousHadLabel = false;

    return plannedScenes.map((planned, index) => {
        const label = planned.textOnImage;
        if (!label) {
            previousHadLabel = false;
            return planned;
        }

        const narration = scenes[index]?.text || '';
        const isFigure = /\d/.test(label);

        const allowed = isFigure || (!previousHadLabel && used < maxLabelled);
        if (!allowed) {
            previousHadLabel = false;
            return { ...planned, textOnImage: null };
        }

        used += 1;
        previousHadLabel = true;
        return { ...planned, textOnImage: buildApprovedLabel(narration, label) };
    });
}

module.exports = {
    buildApprovedLabel,
    thinOutLabels,
    extractFigures,
    toRenderableAscii,
    MAX_FIGURE_LENGTH,
    MAX_WORD_LENGTH,
};
