/**
 * Locked narration pace — same settings for every scene.
 * Do not vary rate, pauses, or voice style per scene.
 */
const TTS_PACE = {
    speed: 1.0,
    googleSpeakingRate: 0.97,
    elevenSpeed: 1.0,
    elevenStability: 0.85,
    elevenSimilarity: 0.80,
    elevenStyle: 0.0,
    sarvamPace: 1.0,
    /** bulbul:v3 — low temperature keeps the same speaker/pace across the clip */
    sarvamTemperature: 0.15,
};

/**
 * Flatten punctuation that makes TTS pause extra on some scenes
 * (em dashes, ellipsis, rupee sign, thousand-separators).
 * Spoken words stay the same; delivery stays even.
 */
function flattenForEvenPace(text) {
    if (text == null || typeof text !== 'string') return '';
    return text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/[\u2014\u2013\u2012]/g, ' ')
        .replace(/\s*\.{2,}\s*/g, '. ')
        .replace(/₹\s*/g, '')
        .replace(/(\d),(\d{3})\b/g, '$1$2')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = { TTS_PACE, flattenForEvenPace };
