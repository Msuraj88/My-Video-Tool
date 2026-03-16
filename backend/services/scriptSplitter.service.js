function getWordCount(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function processScript(scriptText) {
    if (!scriptText || typeof scriptText !== 'string') return [];

    // 1. Proper sentence detection
    const sentences = scriptText.match(/[^.!?]+[.!?]+/g) || [];

    const scenes = [];
    let currentScene = "";
    let currentWordCount = 0;

    const MIN_MICRO_WORDS = 5;
    const MAX_SCENE_WORDS = 16;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        const sentenceWordCount = getWordCount(sentence);

        const isMicro = sentenceWordCount <= MIN_MICRO_WORDS;

        // If adding this sentence exceeds max cap, push current scene first
        if (
            currentWordCount > 0 &&
            currentWordCount + sentenceWordCount > MAX_SCENE_WORDS
        ) {
            scenes.push(currentScene.trim());
            currentScene = "";
            currentWordCount = 0;
        }

        if (isMicro) {
            // Merge micro sentence into current scene
            currentScene += " " + sentence;
            currentWordCount += sentenceWordCount;
        } else {
            // If current scene already has content, push it first
            if (currentWordCount > 0) {
                scenes.push(currentScene.trim());
            }

            currentScene = sentence;
            currentWordCount = sentenceWordCount;
        }
    }

    // Push final scene
    if (currentScene.trim().length > 0) {
        scenes.push(currentScene.trim());
    }

    return scenes.map((text, index) => ({
        scene_number: index + 1,
        text: text.trim(),
        word_count: getWordCount(text),
        // Default emotion; can be refined later by the emotion tagging stage
        emotion: 'explaining'
    }));
}

module.exports = {
    processScript
};