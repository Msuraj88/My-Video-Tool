/**
 * Scene Director: extracts structured visual components from narration text
 * so that images become conceptual explainer visuals instead of generic poses.
 * Converts each sentence into a clear visual concept before building image prompts.
 */

// -----------------------------------------------------------------------------
// VISUAL CONCEPT DETECTION — sentence → concept label (aligns image to narration)
// -----------------------------------------------------------------------------

/** Concept keywords: order matters; first match wins. Story beats before finance mechanics. */
const CONCEPT_KEYWORDS = [
    { concept: 'character_introduction', patterns: [/मिलो/i, /\bmeet\b/i, /\bintroduc/i, /परिचय/i] },
    { concept: 'attitude_comparison', patterns: [/सोच/i, /\battitude\b/i, /\bmindset\b/i, /अलग है/i, /\bstability\b/i, /पसंद है/i] },
    { concept: 'equal_situation', patterns: [/financial situation/i, /एक जैस/i, /बिल्कुल same/i, /same है/i, /equal/i] },
    { concept: 'shared_savings', patterns: [/\bsavings?\b/i, /बचत/i, /लाख/i, /रुपय/i, /₹/] },
    { concept: 'demographics', patterns: [/उम्र/i, /\bage\b/i, /तीस/i, /thirty/i, /शहर/i, /\bcity\b/i, /रहते/i, /\blive/i] },
    { concept: 'income_comparison', patterns: [/\bincome\b/i, /\bsalary\b/i, /वेतन/i, /आय/i] },
    { concept: 'credit_card_payment', patterns: [/\bcredit card\b/, /\bpays? off\b/, /\bbalance\b/, /\bcard payment\b/i] },
    { concept: 'saving_money', patterns: [/\bsave\b/, /\bsaving\b/, /\bpiggy bank\b/i] },
    { concept: 'paying_bills', patterns: [/\bbills?\b/, /\bpay(ing)? bills?\b/, /\binvoices?\b/i] },
    { concept: 'investing', patterns: [/\binvest\b/, /\binvestment\b/, /\bstocks?\b/, /\bportfolio\b/i] },
    { concept: 'debt', patterns: [/\bdebt\b/, /\bowe\b/, /\bloan\b/i] },
];

/**
 * Analyzes the sentence and returns a concept label for visual alignment.
 * Each sentence is mapped to a distinct visual scenario (never generic unless default).
 * @param {string} sentence - Narration text for the scene.
 * @returns {string} Concept key used in VISUAL_SCENE_TEMPLATES.
 */
function detectVisualConcept(sentence) {
    if (!sentence || typeof sentence !== 'string') return 'story_moment';
    const text = sentence.trim();
    const lower = text.toLowerCase();
    for (const { concept, patterns } of CONCEPT_KEYWORDS) {
        if (patterns.some((p) => p.test(text) || p.test(lower))) return concept;
    }
    return 'story_moment';
}

/**
 * Visual scene templates: one distinct scenario per concept.
 * Ensures each concept generates a different visual (no repeated poses/environments).
 */
const VISUAL_SCENE_TEMPLATES = {
    character_introduction: 'two stick figures standing together on a modern Indian city street, both facing the viewer with friendly relaxed poses, equal visual importance',
    attitude_comparison: 'two stick figures side by side showing clearly different body language and attitudes through pose and expression only',
    equal_situation: 'two stick figures beside two identical equal-sized jars or stacks showing their situations are the same',
    shared_savings: 'two stick figures beside two equal-height savings jars showing the same amount saved',
    demographics: 'two stick figures together with a simple city skyline behind them, same age, same place',
    income_comparison: 'two stick figures beside two equal pay envelopes or income bars of the same height',
    credit_card_payment: 'stick figure beside credit card statement with a paid stamp',
    saving_money: 'stick figure placing coins into a piggy bank',
    paying_bills: 'stick figure holding stacked bills with a payment checkmark',
    investing: 'stick figure beside a rising growth curve',
    debt: 'stick figure beside a loan document with a warning symbol',
    story_moment: 'stick figures acting out the specific narration moment through pose, environment, and props',
};

const CONCEPT_CHARACTER_ACTIONS = {
    character_introduction: 'two Stickman stick figures (Amit and Rohan) stand together facing the viewer with welcoming relaxed poses on a city street',
    attitude_comparison: 'Amit stick figure stands calmly in a grounded stable pose while Rohan stick figure stands in a contrasting energetic pose beside him',
    equal_situation: 'two Stickman stick figures stand beside two identical equal jars showing their financial starting points match',
    shared_savings: 'two Stickman stick figures gesture toward two equal-height savings jars between them',
    demographics: 'two Stickman stick figures stand together in the same city environment, same height, same age',
    income_comparison: 'two Stickman stick figures stand beside two equal-height income bars showing they earn the same',
    credit_card_payment: 'Stickman stick figure pointing at a credit card statement with balance and paid stamp',
    saving_money: 'Stickman stick figure dropping coins into a piggy bank',
    paying_bills: 'Stickman stick figure holding stacked bills and invoices with a payment checkmark',
    investing: 'Stickman stick figure analyzing financial growth beside an investment chart',
    debt: 'Stickman stick figure looking at a credit card bill with red balance warning',
    story_moment: 'Stickman stick figures acting out the narration moment with clear pose and environment',
};

const CONCEPT_EXPRESSIONS = {
    character_introduction: 'friendly welcoming expressions',
    attitude_comparison: 'contrasting expressions showing different attitudes',
    equal_situation: 'neutral equal expressions on both figures',
    shared_savings: 'pleased equal expressions',
    demographics: 'friendly relaxed expressions',
    income_comparison: 'neutral satisfied expressions',
    credit_card_payment: 'confident expression',
    saving_money: 'positive expression',
    paying_bills: 'focused expression',
    investing: 'engaged expression',
    debt: 'worried expression',
    story_moment: 'expression matching the narration mood',
};

/**
 * Builds a scene description from a sentence: concept → template → combined description.
 * Ensures each scene visually answers "What would someone draw to explain this sentence?"
 * @param {string} sentence - Narration text for the scene.
 * @returns {{ sceneDescription: string, concept: string, template: string }} Scene description, concept, and template (for financial objects line in prompt).
 */
function buildSceneDescriptionFromSentence(sentence) {
    const concept = detectVisualConcept(sentence);
    const direction = generateSceneDirection(sentence);
    const template = VISUAL_SCENE_TEMPLATES[concept] || VISUAL_SCENE_TEMPLATES.story_moment;
    const characterAction = direction.action || CONCEPT_CHARACTER_ACTIONS[concept] || CONCEPT_CHARACTER_ACTIONS.story_moment;
    const expression = CONCEPT_EXPRESSIONS[concept] || CONCEPT_EXPRESSIONS.story_moment;
    const sceneDescription = `${direction.characters}, ${characterAction}, in ${direction.environment}, ${expression}`;
    return { sceneDescription, concept, template };
}

const SCENE_TYPES = [
    'introduction',
    'problem illustration',
    'action demonstration',
    'statistic visualization',
    'crowd statistic',
    'comparison'
];

/**
 * Extracts all numeric/data values from text for later overlay (e.g. $1500, 20%, $772).
 * Numbers must NOT be rendered by the image model; they are rendered as overlays.
 * @param {string} text
 * @returns {string[]} All matching data values (dollars, percentages, large numbers).
 */
function extractNumbers(text) {
    if (!text || typeof text !== 'string') return [];
    const t = text.trim();
    const found = [];
    // Dollar amounts: $1500, $1,500, $772, $1000+
    const dollarMatches = t.match(/\$[\d,]+(?:\.\d+)?\+?/g);
    if (dollarMatches) found.push(...dollarMatches);
    // Percentages: 20%, 35.5%
    const percentMatches = t.match(/\d+(?:\.\d+)?%+/g);
    if (percentMatches) found.push(...percentMatches);
    // Standalone large numbers that look like stats (e.g. "1500 worth")
    const numberMatches = t.match(/\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,})\b/g);
    if (numberMatches) {
        numberMatches.forEach(n => { if (!found.includes(n)) found.push(n); });
    }
    return [...new Set(found)];
}

function titleCasePhrase(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

/**
 * Extracts short highlight phrases for in-scene text overlay.
 * Keeps these concise because they are rendered as callout labels, not paragraphs.
 * @param {string} text
 * @returns {string[]}
 */
function extractHighlightPhrases(text) {
    if (!text || typeof text !== 'string') return [];

    const trimmed = text.trim();
    const highlights = [];
    const pushUnique = (value) => {
        const v = String(value || '').trim();
        if (!v) return;
        if (!highlights.some((item) => item.toLowerCase() === v.toLowerCase())) {
            highlights.push(v);
        }
    };

    const quotedMatches = trimmed.match(/"([^"]{2,60})"/g) || [];
    quotedMatches.forEach((match) => pushUnique(match.replace(/^"|"$/g, '')));

    const stepMatch = trimmed.match(/\bSTEP\s*\d+\b[^.!?\n]*/i);
    if (stepMatch) {
        pushUnique(stepMatch[0].replace(/\s+/g, ' ').trim());
    }

    const phrasePatterns = [
        /\bstatement closing date\b/i,
        /\bdue date\b/i,
        /\blate fee\b/i,
        /\bminimum payment\b/i,
        /\bcredit utilization\b/i,
        /\bcredit limit\b/i,
        /\binterest rate\b/i,
        /\bcredit score\b/i,
        /\bstatement balance\b/i,
        /\bmonthly payment\b/i,
        /\btake time off\b/i,
        /\bquit job\b/i,
        /\bsay no\b/i
    ];

    phrasePatterns.forEach((pattern) => {
        const match = trimmed.match(pattern);
        if (match) pushUnique(titleCasePhrase(match[0]));
    });

    const stepTitleMatch = trimmed.match(/^[^:.\n]{4,70}(?=[:.\n])/);
    if (stepTitleMatch && /\b(find|know|pay|save|avoid|build|grow|reduce|improve|use)\b/i.test(stepTitleMatch[0])) {
        pushUnique(stepTitleMatch[0].trim());
    }

    return highlights.slice(0, 3);
}

/**
 * Classifies scene type from narration using keywords.
 * @param {string} text
 * @returns {string}
 */
function classifySceneType(text) {
    if (!text || typeof text !== 'string') return 'action demonstration';
    const lower = text.toLowerCase();
    if (/मिलो|meet|introduc|परिचय|welcome|hello/i.test(text)) return 'introduction';
    if (/सोच|attitude|mindset|अलग|stability|पसंद/i.test(text)) return 'comparison';
    if (/problem|waste|throw away|lost|risk|danger|wrong/i.test(lower)) return 'problem illustration';
    if (/average|statistic|percent|%|every year|survey|study|data/i.test(lower)) return 'statistic visualization';
    if (/crowd|people|families|millions|everyone/i.test(lower) && /percent|majority|most/i.test(lower)) return 'crowd statistic';
    if (/versus|vs|compared to|difference between|instead of|rather than|बनाम|तुलना/i.test(lower)) return 'comparison';
    return 'action demonstration';
}

function extractNamedCharacters(text) {
    const names = [];
    const t = String(text || '');
    if (/अमित|amit/i.test(t)) names.push('Amit');
    if (/रोहन|rohan/i.test(t)) names.push('Rohan');
    if (/प्रिया|priya/i.test(t)) names.push('Priya');
    if (/राज|raj\b/i.test(t)) names.push('Raj');
    return [...new Set(names)];
}

function inferCharacters(text) {
    if (!text || typeof text !== 'string') return 'Stickman stick figure narrator';
    const lower = text.toLowerCase();
    const names = extractNamedCharacters(text);

    if (names.length >= 2) {
        return `two identical Stickman stick figures representing ${names.join(' and ')} (same waistcoat and bow tie design, distinguish them with a blue accent on ${names[0]} and a green accent on ${names[1]})`;
    }
    if (names.length === 1 && /दोनों|both|together/i.test(text)) {
        const other = names[0] === 'Amit' ? 'Rohan' : 'Amit';
        return `two identical Stickman stick figures representing ${names[0]} and ${other} (same design, subtle color accents to tell them apart)`;
    }
    if (/दोनों|both\b/i.test(text)) {
        return 'two identical Stickman stick figures standing together (same waistcoat and bow tie design)';
    }
    if (/two brothers|brothers/i.test(lower)) return 'two identical Stickman stick figures (same waistcoat and bow tie design)';
    if (/siblings|sisters/i.test(lower)) return 'two identical Stickman stick figures (same design)';
    if (/american family|family of four|family\b/i.test(lower)) return 'group of identical Stickman stick figures (same design)';
    if (/crowd|people|everyone|many/i.test(lower)) return 'group of identical Stickman stick figures (same design)';
    if (names.length === 1) {
        return `Stickman stick figure representing ${names[0]} (waistcoat, bow tie)`;
    }
    return 'Stickman stick figure narrator';
}

/**
 * Infers main action from narration (verb-focused).
 * @param {string} text
 * @returns {string}
 */
function inferAction(text) {
    if (!text || typeof text !== 'string') return 'acting out the narration moment';
    const lower = text.toLowerCase();

    if (/मिलो|meet|introduc|परिचय/i.test(text)) {
        return 'standing together facing the viewer with friendly welcoming poses, natural character introduction';
    }
    if (/stability|stable|पसंद/i.test(lower) && /amit|अमित/i.test(text)) {
        return 'Amit stick figure stands calmly in a grounded stable pose beside a solid heavy block, relaxed and steady';
    }
    if (/सोच|thought|attitude|mindset|अलग/i.test(text)) {
        return 'two stick figures side by side with clearly contrasting body language showing different thinking styles';
    }
    if (/financial situation|एक जैस|बिल्कुल same|same है/i.test(text)) {
        return 'both stick figures stand beside two identical equal jars showing their situations match perfectly';
    }
    if (/savings|बचत|लाख|रुपय/i.test(text)) {
        return 'both stick figures gesture toward two equal-height savings jars between them';
    }
    if (/income|salary|वेतन|आय/i.test(lower) && /दोनों|both|एक जैस/i.test(text)) {
        return 'both stick figures stand beside two equal-height income bars showing they earn the same';
    }
    if (/उम्र|age|तीस|thirty/i.test(text) && /शहर|city|रहते|live/i.test(text)) {
        return 'standing together in their shared city environment, same age, relaxed poses';
    }
    if (/grew up|growing up|बड़|पले/i.test(text)) return 'standing in front of their house together';
    if (/throws? away|throwing away|फेंक|बर्बाद/i.test(text)) return 'throwing groceries into trash bin';
    if (/spend|spending|खर्च/i.test(text)) return 'handling everyday expenses';
    if (/save|saving|बचत|बचान/i.test(text)) return 'placing savings into a jar';
    if (/compare|comparing|तुलना|बनाम/i.test(text)) return 'comparing two options side by side';
    if (/misunderstanding|गलतफहमी|confused|भ्रम/i.test(text)) return 'reacting to confusion with contrasting gestures';
    if (/fame|प्रसिद्धि/i.test(text)) return 'standing on a stage under a spotlight';
    return 'acting out the specific narration moment through clear pose and interaction';
}

/**
 * Infers concrete objects to show in the scene.
 * @param {string} text
 * @param {string} sceneType
 * @returns {string[]}
 */
function inferObjects(text, sceneType) {
    if (!text || typeof text !== 'string') return ['stick figure narrator', 'simple environment'];
    const lower = text.toLowerCase();
    const objects = [];

    if (/मिलो|amit|rohan|अमित|रोहन/i.test(text)) {
        objects.push('two stick figures standing together', 'friendly introduction pose');
    }
    if (/उम्र|age|तीस|thirty|साल/i.test(text)) {
        objects.push('subtle same-age visual cue between both figures');
    }
    if (/शहर|city|रहते|live/i.test(text)) {
        objects.push('simple Indian city skyline', 'street ground line');
    }
    if (/income|salary|वेतन|आय/i.test(lower) && /एक जैस|same|दोनों|both/i.test(text)) {
        objects.push('two equal-height income bars', 'matching pay envelopes');
    }
    if (/savings|बचत|लाख|रुपय|₹/i.test(text)) {
        objects.push('two identical savings jars of equal height', 'equal piles beside both figures');
    }
    if (/financial situation|बिल्कुल same|एक जैस/i.test(text)) {
        objects.push('two identical jars showing equal starting conditions', 'mirrored equal props');
    }
    if (/stability|stable|पसंद/i.test(lower)) {
        objects.push('solid heavy cube beside Amit', 'calm grounded stance');
    }
    if (/सोच|attitude|mindset|अलग/i.test(text)) {
        objects.push('contrasting body language between the two figures', 'different poses side by side');
    }
    if (/misunderstanding|गलतफहमी|confused|confusion|भ्रम/.test(lower)) {
        objects.push('tangled arrows', 'large question mark', 'one straight clean line beside them');
    }
    if (/पहचान|recognition|identity|जानने|जाने/.test(lower)) {
        objects.push('small spotlight on one stick figure', 'name tag icon');
    }
    if (/india|भारत|पूरा india|whole country|पूरा देश/.test(lower)) {
        objects.push('India map outline', 'scattered dots across map');
    }
    if (/fame|प्रसिद्धि|celebrity|star/.test(lower)) {
        objects.push('stage spotlight beam', 'flashing cameras', 'large star shape');
    }
    if (/follower|followers|मिलियन|million|social|instagram|youtube/.test(lower)) {
        objects.push('phone with a crowd of tiny stick figures on screen', 'heart and thumb icons floating up');
    }
    if (/\btv\b|television|टीवी|screen|broadcast/.test(lower)) {
        objects.push('TV set showing a stick figure', 'broadcast tower with signal waves');
    }
    if (/नाम|name|सुना|heard everywhere|हर जगह/.test(lower)) {
        objects.push('megaphone with sound waves', 'repeating silhouettes spreading outward');
    }
    if (/versus|vs|बनाम|मतलब ये नहीं|not the same|difference|अंतर/.test(lower)) {
        objects.push('split comparison panel divided by a line', 'large X shape beside a large checkmark');
    }

    // Interest / compounding / income (Hindi + English)
    if (/compound|चक्रवृद्धि|कंपाउंड/.test(lower)) {
        objects.push(
            'row of coin stacks each taller than the last',
            'snowball rolling downhill growing larger',
            'upward curving growth line made of coins'
        );
    } else if (/interest|ब्याज/.test(lower)) {
        objects.push('single coin sprouting extra coins', 'small upward arrow above a coin pile');
    }
    if (/salary|सैलरी|वेतन|income|आय|तनख्वाह/i.test(lower) && !/मिलो|शहर|उम्र/i.test(text)) {
        objects.push('pay envelope', 'income bar');
    }
    if (/power|असली|ताकत|शक्ति/.test(lower)) {
        objects.push('small seed beside a large tree showing growth');
    }
    if (/time|महीन|month|समय/i.test(lower) && !/उम्र|age|साल/i.test(text)) {
        objects.push('calendar pages stacked along the timeline');
    }

    if (/\bbudget|save|bank|बचत|बैंक\b/.test(lower)) objects.push('piggy bank or chart');
    if (/\bpercent|%\b/.test(lower)) objects.push('percentage graphic');
    if (/\bjob|salary|नौकरी|वेतन\b/.test(lower)) objects.push('salary arrow', 'paycheck');
    if (/\bdebt|loan|कर्ज\b/.test(lower)) objects.push('debt weight', 'loan document');
    if (/\binvest|stock|निवेश\b/.test(lower)) objects.push('rising chart', 'growth arrow');
    if (/\bcredit card|card\b/.test(lower)) objects.push('credit card', 'statement');
    if (/\bbill|invoice|बिल\b/.test(lower)) objects.push('stacked bills', 'invoice');
    if (/\bfood|groceries|bread|apple|vegetables|fruit|खान|सब्ज\b/.test(lower)) {
        objects.push('bread', 'apple', 'vegetables');
    }
    if (/\btrash|throw away|waste|फेंक|बर्बाद\b/.test(lower)) objects.push('trash can');
    if (/\bhouse|home|same house|घर\b/.test(lower)) objects.push('house', 'suburban home');
    if (/\bcar|vehicle|payment|auto\b/.test(lower)) objects.push('car');
    if (/money|dollar|\$|payment|cost|पैस/i.test(lower) && /savings|बचत|लाख|रुपय/i.test(text)) {
        objects.push('equal money jars');
    }

    if (objects.length === 0) {
        if (/दोनों|both/i.test(text)) return ['two stick figures', 'simple environment with ground line'];
        return ['stick figure narrator', 'simple environment with ground line'];
    }
    return [...new Set(objects)].slice(0, 5);
}

/**
 * Infers environment/setting from narration.
 * @param {string} text
 * @returns {string}
 */
function inferEnvironment(text) {
    if (!text || typeof text !== 'string') return 'simplified explainer stage with a ground line';
    const lower = text.toLowerCase();

    if (/सोच|attitude|mindset|stability|अलग/i.test(text)) {
        return 'simple neutral backdrop with ground line, focus on the two figures and their contrasting poses';
    }
    if (/मिलो|शहर|city|रहते/i.test(text) || (/अमित|रोहन|amit|rohan/i.test(text) && /शहर|city|रहते|मिलो/i.test(text))) {
        return 'modern Indian city street with simple buildings and a ground line';
    }
    if (/savings|बचत|financial situation|लाख|रुपय/i.test(text)) {
        return 'simple home interior with a table and two equal savings jars, ground line visible';
    }
    if (/income|salary|वेतन|आय/i.test(lower) && !/मिलो|शहर|उम्र/i.test(text)) {
        return 'simple home table scene with equal income props and a ground line';
    }
    if (/compound|interest|ब्याज|चक्रवृद्धि/i.test(text)) return 'bank hall with a large growth chart on the wall and a ground line';
    if (/fame|spotlight|stage|टीवी|tv|celebrity/i.test(text)) return 'stage with spotlight and media props';
    if (/follower|social|phone|million/.test(lower)) return 'social media feed backdrop';
    if (/misunderstanding|confused|गलतफहमी|भ्रम/.test(lower)) return 'diagram board with tangled arrows';
    if (/\bhouse|home|same house|grew up\b/.test(lower)) return 'suburban house';
    if (/\bkitchen|food|groceries|throw away\b/.test(lower)) return 'kitchen';
    if (/\bcar|garage|driveway|suburban|payment\b/.test(lower)) return 'simple suburban house background';
    if (/\boffice|work|business\b/.test(lower)) return 'simple office';
    if (/\bstore|shop|buy\b/.test(lower)) return 'store';
    if (/\bschool|college|university\b/.test(lower)) return 'school building or campus';
    return 'simplified explainer environment with a visible ground line';
}

/**
 * Infers emotion/mood for the scene.
 * @param {string} text
 * @param {string} sceneType
 * @returns {string}
 */
function inferEmotion(text, sceneType) {
    if (!text || typeof text !== 'string') return 'neutral';
    const lower = text.toLowerCase();
    if (/\bwaste|throw away|lost|problem\b/.test(lower)) return 'wasteful';
    if (/\bworried|concern|expensive|payment|cost\b/.test(lower)) return 'concerned';
    if (/\bhappy|save|success|win\b/.test(lower)) return 'positive';
    if (/\bcompare|versus|difference\b/.test(lower)) return 'analytical';
    if (/सोच|attitude|mindset|अलग|stability/i.test(text)) return 'contrasting';
    if (/मिलो|meet|introduc|परिचय/i.test(text)) return 'friendly';
    return 'neutral';
}

/**
 * Generates structured scene direction from narration text.
 * Numbers are extracted and stored in numbers[] for text overlay only; never in image prompt.
 *
 * @param {string} sceneText - The narration for the scene.
 * @returns {{
 *   scene_type: string,
 *   characters: string,
 *   action: string,
 *   objects: string[],
 *   environment: string,
 *   emotion: string,
 *   numbers: string[]
 * }}
 */
function generateSceneDirection(sceneText) {
    const trimmed = typeof sceneText === 'string' ? sceneText.trim() : '';
    const scene_type = classifySceneType(trimmed);
    const numbers = extractNumbers(trimmed);
    const characters = inferCharacters(trimmed);
    const action = inferAction(trimmed);
    const objects = inferObjects(trimmed, scene_type);
    const environment = inferEnvironment(trimmed);
    const emotion = inferEmotion(trimmed, scene_type);

    return {
        scene_type,
        characters,
        action,
        objects,
        environment,
        emotion,
        numbers
    };
}

module.exports = {
    generateSceneDirection,
    extractNumbers,
    extractHighlightPhrases,
    detectVisualConcept,
    buildSceneDescriptionFromSentence,
    inferObjects,
    VISUAL_SCENE_TEMPLATES,
    CONCEPT_CHARACTER_ACTIONS,
    CONCEPT_EXPRESSIONS,
    SCENE_TYPES
};
