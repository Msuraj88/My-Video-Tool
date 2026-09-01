function getWordCount(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function splitIntoSentences(scriptText) {
    const text = String(scriptText || '').trim();
    if (!text) return [];

    if (!/[।.!?]/.test(text)) {
        const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
        return lines.length ? lines : [text];
    }

    // English .!? plus Hindi danda ।. Keep a trailing fragment that has no terminator.
    const matches = text.match(/[^।.!?]+[।.!?]+|[^।.!?]+$/g);
    if (!matches) return [text];
    return matches.map((s) => s.trim()).filter(Boolean);
}

/**
 * One sentence can contain two beats (e.g. "X, but Y") — split only on clear pivots.
 */
function splitDualVisualSentence(sentence) {
    const text = String(sentence || '').trim();
    if (!text) return [];

    const parts = text.split(/(?:\s+लेकिन\s+|\s+पर\s+|\s+फिर\s+|\s+but\s+|\s+then\s+|\s+however\s+)/i)
        .map((part) => part.trim())
        .filter((part) => part.length > 3);

    return parts.length > 1 ? parts : [text];
}

/**
 * Classifies a sentence by its primary visual beat.
 * Order matters — more specific beats before broad demographic cues.
 */
function detectVisualBeat(sentence) {
    const text = String(sentence || '').trim();
    const lower = text.toLowerCase();
    if (!text) return 'general';

    if (/मिलो|meet|introduc|परिचय|say hello/i.test(text)) return 'character_intro';
    if (/income|salary|वेतन|आय|earning|earn|savings?|बचत|रुपय|rupee|₹|लाख|crore|पच्चीस|financial situation|net worth|assets?|पैस/i.test(lower)) {
        return 'financial_status';
    }
    if (/उम्र|age|साल|years?\s+old|रहते|रहती|live|lives|city|शहर|town|village|एक ही शहर|same city/i.test(lower)) {
        return 'demographics';
    }
    if (/सोच|think|thought|attitude|mindset|पसंद|prefer|stability|risk|approach|विचार|मानसिकता/i.test(lower)) {
        return 'attitude';
    }
    if (/interest|compound|invest|debt|loan|inflation|budget|ब्याज|निवेश|कर्ज|चक्रवृद्धि/i.test(lower)) {
        return 'concept';
    }
    if (/versus|vs|बनाम|on the other hand|दूसरी तरफ|comparison|compare|तुलना/i.test(lower)) {
        return 'comparison';
    }
    if (/later|next|then|suddenly|now|अब|फिर|पहले|बाद में|after|before|years later|next day/i.test(lower)) {
        return 'time_shift';
    }
    if (/goes to|went to|arrives|reaches|enters|leave|leaves|switch|changes? to/i.test(lower)) {
        return 'location_change';
    }
    if (/bank|office|market|store|school|hospital|restaurant|park|stage|studio/i.test(lower)
        && !/एक ही|same city|same house|same town|same place/i.test(lower)) {
        return 'location_change';
    }
    if (/नाम|named|called/i.test(lower) && /से|meet/i.test(lower)) return 'character_intro';

    return 'general';
}

/** Beats that belong to one "meet the characters" visual moment. */
const CHARACTER_ESTABLISHMENT = new Set(['character_intro', 'demographics']);

/** Beats that always start a new scene when they follow something else. */
const HARD_BREAK_BEATS = new Set(['time_shift', 'location_change']);

/**
 * Whether two consecutive visual beats belong in the same storyboard frame.
 */
function beatsShareVisualMoment(currentBeat, nextBeat) {
    if (currentBeat === nextBeat) return true;
    if (HARD_BREAK_BEATS.has(nextBeat)) return false;

    if (CHARACTER_ESTABLISHMENT.has(currentBeat) && CHARACTER_ESTABLISHMENT.has(nextBeat)) {
        return true;
    }

    // A vague follow-up line usually extends the current beat.
    if (nextBeat === 'general') return true;
    if (currentBeat === 'general' && !HARD_BREAK_BEATS.has(nextBeat)) return true;

    // Different emphasis even at the same location → separate scenes.
    if (currentBeat === 'character_intro' || currentBeat === 'demographics') {
        return nextBeat === 'character_intro' || nextBeat === 'demographics';
    }
    if (currentBeat === 'financial_status') return nextBeat === 'financial_status';
    if (currentBeat === 'attitude') return nextBeat === 'attitude' || nextBeat === 'comparison';
    if (currentBeat === 'concept') return nextBeat === 'concept';
    if (currentBeat === 'comparison') return nextBeat === 'comparison' || nextBeat === 'attitude';

    return false;
}

function getGroupEndingBeat(groupText) {
    const parts = splitIntoSentences(groupText);
    if (!parts.length) return 'general';
    return detectVisualBeat(parts[parts.length - 1]);
}

/**
 * Returns true when the next sentence still belongs to the same storyboard frame.
 * Visual and semantic coherence take priority over word count.
 */
function shouldMergeIntoCurrentScene(groupText, nextSentence) {
    const group = String(groupText || '').trim();
    const next = String(nextSentence || '').trim();
    if (!group) return true;
    if (!next) return false;

    const currentBeat = getGroupEndingBeat(group);
    const nextBeat = detectVisualBeat(next);

    if (!beatsShareVisualMoment(currentBeat, nextBeat)) {
        return false;
    }

    // Same beat but the group is already long — only keep merging tight continuations.
    const combinedWords = getWordCount(`${group} ${next}`);
    if (combinedWords > 30 && nextBeat === 'general') {
        return false;
    }
    if (combinedWords > 35) {
        return /^(और|and|also|दोनों|both|वे|they)\b/i.test(next)
            && beatsShareVisualMoment(currentBeat, nextBeat);
    }

    return true;
}

function processScript(scriptText) {
    if (!scriptText || typeof scriptText !== 'string') return [];

    const sentences = splitIntoSentences(scriptText)
        .flatMap((sentence) => splitDualVisualSentence(sentence));

    const scenes = [];
    let currentScene = '';

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        if (!sentence) continue;

        if (!currentScene) {
            currentScene = sentence;
            continue;
        }

        if (shouldMergeIntoCurrentScene(currentScene, sentence)) {
            currentScene = `${currentScene} ${sentence}`.trim();
        } else {
            scenes.push(currentScene.trim());
            currentScene = sentence;
        }
    }

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
    processScript,
    detectVisualBeat,
    beatsShareVisualMoment,
};
