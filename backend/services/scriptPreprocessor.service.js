/**
 * Script preprocessing for narration pacing.
 * In "explainer" mode: minimal pauses, clear articulation, no dramatic stretching.
 * In cinematic/dramatic modes: natural pauses, ellipsis, breath breaks.
 */

const SHORT_SENTENCE_MAX_WORDS = 6;
const BREATH_PHRASE_WORDS = 12; // Insert optional breath break every N words (cinematic/dramatic only)
const NARRATION_MODE = process.env.NARRATION_MODE || "explainer";
const IS_EXPLAINER_STYLE = NARRATION_MODE === "explainer";

/**
 * Detects if a sentence is short (suitable for dramatic ellipsis before the period).
 */
function isShortSentence(phrase) {
    const trimmed = phrase.trim();
    if (!trimmed) return false;
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);
    return words.length <= SHORT_SENTENCE_MAX_WORDS && /[.!?]$/.test(trimmed);
}

/**
 * Adds ellipsis before the final period in short, punchy sentences for dramatic pacing.
 */
function addDramaticEllipsis(phrase) {
    const trimmed = phrase.trim();
    if (!trimmed || !isShortSentence(trimmed)) return trimmed;
    // Avoid double ellipsis
    if (/\.\.\.\s*\.\s*$/.test(trimmed)) return trimmed;
    if (/\.\s*$/.test(trimmed)) {
        return trimmed.replace(/\.\s*$/, ' ... ');
    }
    if (/!\s*$/.test(trimmed) || /\?\s*$/.test(trimmed)) {
        return trimmed.replace(/([!?])\s*$/, '$1 ... ');
    }
    return trimmed;
}

/**
 * Inserts line breaks for breath control in long sentences (after commas/semicolons
 * when phrase length exceeds BREATH_PHRASE_WORDS).
 */
function insertBreathBreaks(text) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const result = sentences.map(sentence => {
        const words = sentence.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length <= BREATH_PHRASE_WORDS) return sentence.trim();

        let wordCount = 0;
        let out = '';
        const tokens = sentence.split(/(\s+)/);

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const isPunct = /^[.,;:]$/.test(token.trim());
            const isSpace = /^\s+$/.test(token);

            if (isSpace) {
                out += token;
                continue;
            }
            if (isPunct && wordCount >= BREATH_PHRASE_WORDS) {
                out += token + '\n';
                wordCount = 0;
                continue;
            }
            if (!isPunct) wordCount++;
            out += token;
        }
        return out.trim();
    });
    return result.join(' ');
}

/**
 * Normalizes existing ellipsis to a single style and ensures space around for TTS.
 */
function normalizeEllipsis(text) {
    return text
        .replace(/\s*\.{2,}\s*/g, ' ... ')
        .replace(/\s*\.\.\.\s*\.\.\.\s*/g, ' ... ');
}

/**
 * Main entry: preprocesses raw script for narration pacing.
 * Explainer mode: normalize only — no dramatic ellipsis, no extra breath pauses (confident, clear).
 * Cinematic/dramatic: natural pauses after sentences, dramatic ellipsis on short lines, breath breaks.
 *
 * @param {string} scriptText - Raw script from user/LLM
 * @returns {string} - Preprocessed script ready for scene splitting and TTS
 */
function preprocessForNarration(scriptText) {
    if (!scriptText || typeof scriptText !== 'string') return '';

    let out = scriptText.trim();

    // Normalize ellipsis so existing ... are consistent
    out = normalizeEllipsis(out);

    if (IS_EXPLAINER_STYLE) {
        // Confident explainer: no dramatic pacing, no extra pauses — keep speech natural and articulate
        return out.replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
    }

    // Cinematic/dramatic: sentence-by-sentence dramatic pacing
    const sentenceBoundary = /(?<=[.!?])\s+/;
    const parts = out.split(sentenceBoundary);
    const processed = parts.map(part => {
        let p = part.trim();
        p = addDramaticEllipsis(p);
        return p;
    });
    out = processed.join(' ');

    out = insertBreathBreaks(out);

    out = out.replace(/([.!?])\s*/g, (match, punct) => {
        if (punct === '!' || punct === '?') return punct + '\n\n... ';
        return punct + '\n... ';
    });

    return out.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

module.exports = {
    preprocessForNarration,
    normalizeEllipsis,
    addDramaticEllipsis,
    insertBreathBreaks
};
