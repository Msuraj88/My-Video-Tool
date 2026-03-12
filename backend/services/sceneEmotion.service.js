const DEFAULT_EMOTION = 'explaining';

/**
 * Very lightweight heuristic emotion tagging based on scene text.
 * Falls back to "explaining" for general educational narration.
 *
 * @param {string} text
 * @returns {string}
 */
function inferEmotionFromText(text) {
    if (!text || typeof text !== 'string') {
        return DEFAULT_EMOTION;
    }

    const lower = text.toLowerCase();

    if (/(welcome|glad you|happy to|excited|thanks|friend)/.test(lower)) {
        return 'friendly';
    }

    if (/(imagine|think about|consider|let\'s think|question)/.test(lower)) {
        return 'thinking';
    }

    if (/(wow|incredible|amazing|suddenly|you won\'t believe)/.test(lower)) {
        return 'surprised';
    }

    if (/(important|serious|critical|risk|warning|caution|problem)/.test(lower)) {
        return 'serious';
    }

    if (/(key idea|the main point|the takeaway|what this means)/.test(lower)) {
        return 'confident';
    }

    // Default for explainer content
    return DEFAULT_EMOTION;
}

/**
 * Ensures each scene has an emotion field.
 * @param {Array<{ scene_number: number, text: string, emotion?: string }>} scenes
 * @returns {Array<{ scene_number: number, text: string, emotion: string }>}
 */
function tagScenesWithEmotion(scenes) {
    if (!Array.isArray(scenes)) return [];

    return scenes.map(scene => {
        const baseEmotion = scene && typeof scene.emotion === 'string' && scene.emotion.trim()
            ? scene.emotion.trim().toLowerCase()
            : null;

        const inferred = baseEmotion || inferEmotionFromText(scene.text);

        return {
            ...scene,
            emotion: inferred || DEFAULT_EMOTION
        };
    });
}

module.exports = {
    tagScenesWithEmotion,
    inferEmotionFromText,
    DEFAULT_EMOTION
};

