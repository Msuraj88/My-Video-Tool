/**
 * Scene Director: extracts structured visual components from narration text
 * so that images become conceptual explainer visuals instead of generic poses.
 * Converts each sentence into a clear visual concept before building image prompts.
 */

// -----------------------------------------------------------------------------
// VISUAL CONCEPT DETECTION — sentence → concept label (aligns image to narration)
// -----------------------------------------------------------------------------

/** Concept keywords: order matters; first match wins. More specific before general. */
const CONCEPT_KEYWORDS = [
    { concept: 'credit_card_payment', patterns: [/\bcredit card\b/, /\bpays? off\b/, /\bbalance\b/, /\bcard payment\b/, /\bpay(ing)? (your )?credit card\b/i] },
    { concept: 'saving_money', patterns: [/\bsave\b/, /\bsaving\b/, /\bsavings\b/, /\bpiggy bank\b/, /\bput(ting)? (money )?aside\b/i] },
    { concept: 'paying_bills', patterns: [/\bbills?\b/, /\bpay(ing)? bills?\b/, /\binvoices?\b/, /\butility\b/, /\bmonthly payment\b/i] },
    { concept: 'investing', patterns: [/\binvest\b/, /\binvestment\b/, /\binvesting\b/, /\bstocks?\b/, /\bportfolio\b/, /\breturns?\b/i] },
    { concept: 'debt', patterns: [/\bdebt\b/, /\bowe\b/, /\bowing\b/, /\bpay(ing)? down\b/, /\bpayoff\b/i] },
];

/**
 * Analyzes the sentence and returns a concept label for visual alignment.
 * Each sentence is mapped to a distinct visual scenario (never generic unless default).
 * @param {string} sentence - Narration text for the scene.
 * @returns {string} Concept key used in VISUAL_SCENE_TEMPLATES.
 */
function detectVisualConcept(sentence) {
    if (!sentence || typeof sentence !== 'string') return 'general_finance';
    const lower = sentence.trim().toLowerCase();
    for (const { concept, patterns } of CONCEPT_KEYWORDS) {
        if (patterns.some(p => p.test(lower))) return concept;
    }
    return 'general_finance';
}

/**
 * Visual scene templates: one distinct scenario per concept.
 * Ensures each concept generates a different visual (no repeated poses/environments).
 */
const VISUAL_SCENE_TEMPLATES = {
    credit_card_payment: 'stick figure beside credit card statement showing balance $0 with a large PAID stamp and green checkmark',
    saving_money: 'stick figure dropping coins into a piggy bank with coins stacking beside it',
    paying_bills: 'stick figure holding stacked bills and invoices with paid stamps',
    investing: 'stick figure beside investment chart rising upward, analyzing financial growth',
    debt: 'stick figure looking at credit card bill showing red balance warning',
    general_finance: 'stick figure beside large conceptual diagram or symbolic objects that explain the finance idea'
};

/** Character action per concept — always the locked Stickman stick figure. */
const CONCEPT_CHARACTER_ACTIONS = {
    credit_card_payment: 'Stickman stick figure pointing at a credit card statement with balance and paid stamp',
    saving_money: 'Stickman stick figure dropping coins into a piggy bank',
    paying_bills: 'Stickman stick figure holding stacked bills and invoices with a payment checkmark',
    investing: 'Stickman stick figure analyzing financial growth beside an investment chart',
    debt: 'Stickman stick figure looking at a credit card bill with red balance warning',
    general_finance: 'Stickman stick figure gesturing toward large symbolic objects that explain the finance concept'
};

/** Expression per concept for visual alignment. */
const CONCEPT_EXPRESSIONS = {
    credit_card_payment: 'confident expression',
    saving_money: 'positive expression',
    paying_bills: 'focused expression',
    investing: 'engaged expression',
    debt: 'worried expression',
    general_finance: 'neutral confident expression'
};

/**
 * Builds a scene description from a sentence: concept → template → combined description.
 * Ensures each scene visually answers "What would someone draw to explain this sentence?"
 * @param {string} sentence - Narration text for the scene.
 * @returns {{ sceneDescription: string, concept: string, template: string }} Scene description, concept, and template (for financial objects line in prompt).
 */
function buildSceneDescriptionFromSentence(sentence) {
    const concept = detectVisualConcept(sentence);
    const template = VISUAL_SCENE_TEMPLATES[concept] || VISUAL_SCENE_TEMPLATES.general_finance;
    const characterAction = CONCEPT_CHARACTER_ACTIONS[concept] || CONCEPT_CHARACTER_ACTIONS.general_finance;
    const expression = CONCEPT_EXPRESSIONS[concept] || CONCEPT_EXPRESSIONS.general_finance;
    const sceneDescription = `${characterAction}, ${template}, ${expression}`;
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
    if (/\b(welcome|introduce|today we|let's talk|hello)\b/.test(lower)) return 'introduction';
    if (/\b(problem|waste|throw away|lost|risk|danger|wrong)\b/.test(lower)) return 'problem illustration';
    if (/\b(average|statistic|percent|%|every year|survey|study|data)\b/.test(lower)) return 'statistic visualization';
    if (/\b(crowd|people|families|millions|everyone)\b/.test(lower) && /\b(percent|majority|most)\b/.test(lower)) return 'crowd statistic';
    if (/\b(versus|vs|compared to|difference between|instead of|rather than)\b/.test(lower)) return 'comparison';
    return 'action demonstration';
}

/**
 * Infers character(s) from narration.
 * @param {string} text
 * @returns {string}
 */
function inferCharacters(text) {
    if (!text || typeof text !== 'string') return 'Stickman stick figure narrator';
    const lower = text.toLowerCase();
    if (/\btwo brothers|brothers\b/.test(lower)) return 'two identical Stickman stick figures (same waistcoat and bow tie design)';
    if (/\bsiblings|sisters\b/.test(lower)) return 'two identical Stickman stick figures (same design)';
    if (/\bamerican family|family of four|family\b/.test(lower)) return 'group of identical Stickman stick figures (same design)';
    if (/\bcrowd|people|everyone|many\b/.test(lower)) return 'group of identical Stickman stick figures (same design)';
    return 'Stickman stick figure narrator';
}

/**
 * Infers main action from narration (verb-focused).
 * @param {string} text
 * @returns {string}
 */
function inferAction(text) {
    if (!text || typeof text !== 'string') return 'explaining the concept with symbolic objects';
    const lower = text.toLowerCase();
    if (/\bgrew up|growing up|बड़[ae]|पले\b/.test(lower)) return 'standing in front of their house together';
    if (/\bthrows? away|throwing away|फेंक|बर्बाद\b/.test(lower)) return 'throwing groceries into trash bin';
    if (/\b(reached|reaches?|paying|payment|भुगतान|चुकान)\b/.test(lower)) return 'standing beside car or payment chart looking concerned';
    if (/\bspend|spending|खर्च\b/.test(lower)) return 'spending or handling money with visible expense icons';
    if (/\bsave|saving|बचत|बचान\b/.test(lower)) return 'saving money or placing into piggy bank';
    if (/\bwaste|wasting|बर्बाद\b/.test(lower)) return 'discarding or wasting resources';
    if (/\bcompare|comparing|तुलना|बनाम\b/.test(lower)) return 'comparing two options or split path';
    if (/\bshow|showing|demonstrate|दिखा\b/.test(lower)) return 'demonstrating the concept with large metaphor objects';
    if (/\bjob|salary|नौकरी|वेतन\b/.test(lower)) return 'beside salary arrow, paycheck, or career path symbols';
    if (/\bdebt|loan|कर्ज|ऋण\b/.test(lower)) return 'weighing down under debt symbols or loan documents';
    if (/\binvest|निवेश\b/.test(lower)) return 'beside rising chart or growth arrows';
    if (/compound|चक्रवृद्धि/.test(lower)) return 'watching wide-eyed as coin stacks grow taller beside a rising curve';
    if (/interest|ब्याज/.test(lower)) return 'pointing at a coin pile sprouting extra coins';
    if (/salary|सैलरी|वेतन/.test(lower)) return 'holding a pay envelope while coins pour into a jar';
    if (/misunderstanding|गलतफहमी|confused|भ्रम/.test(lower)) return 'pointing at tangled arrows and a large question mark';
    if (/पहचान|recognition/.test(lower)) return 'standing under a small spotlight next to an India map';
    if (/follower|million|मिलियन/.test(lower)) return 'gesturing at phone showing 1M followers and a TV screen';
    if (/fame|प्रसिद्धि/.test(lower)) return 'standing on a stage under a spotlight with cameras';
    return 'presenting the narration idea with clear symbolic objects';
}

/**
 * Infers concrete objects to show in the scene.
 * @param {string} text
 * @param {string} sceneType
 * @returns {string[]}
 */
function inferObjects(text, sceneType) {
    if (!text || typeof text !== 'string') return ['large concept icon', 'symbolic diagram', 'arrow'];
    const lower = text.toLowerCase();
    const objects = [];

    // Fame / recognition / social (Hindi + English)
    // "समझ" alone means "understand" — only treat explicit confusion words as misunderstanding
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
    if (/salary|सैलरी|वेतन|income|आय|तनख्वाह/.test(lower)) {
        objects.push('pay envelope', 'coins flowing along an arrow into a jar');
    }
    if (/power|असली|ताकत|शक्ति/.test(lower)) {
        objects.push('small seed beside a large tree showing growth');
    }
    if (/time|साल|year|महीन|month|समय/.test(lower)) {
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
    if (/\bmoney|dollar|\$|payment|cost|पैस|रुपय\b/.test(lower)) objects.push('money or payment graphic');

    if (objects.length === 0) {
        objects.push('large metaphor icon', 'thought bubble with symbol', 'directional arrow');
    }
    return [...new Set(objects)].slice(0, 5);
}

/**
 * Infers environment/setting from narration.
 * @param {string} text
 * @returns {string}
 */
function inferEnvironment(text) {
    if (!text || typeof text !== 'string') return 'simplified explainer stage with props';
    const lower = text.toLowerCase();
    if (/compound|interest|ब्याज|चक्रवृद्धि/.test(lower)) return 'bank hall with a large growth chart on the wall and a ground line';
    if (/salary|सैलरी|वेतन|income|आय/.test(lower)) return 'simple home table scene with a money jar and a ground line';
    if (/fame|spotlight|stage|टीवी|tv|celebrity/.test(lower)) return 'stage with spotlight and media props';
    if (/india|भारत|map|देश/.test(lower)) return 'infographic map backdrop';
    if (/follower|social|phone|million/.test(lower)) return 'social media feed backdrop';
    if (/misunderstanding|confused|गलतफहमी|भ्रम/.test(lower)) return 'diagram board with tangled arrows';
    if (/\bhouse|home|same house|grew up\b/.test(lower)) return 'suburban house';
    if (/\bkitchen|food|groceries|throw away\b/.test(lower)) return 'kitchen';
    if (/\bcar|garage|driveway|suburban|payment\b/.test(lower)) return 'simple suburban house background';
    if (/\boffice|work|business\b/.test(lower)) return 'simple office';
    if (/\bstore|shop|buy\b/.test(lower)) return 'store';
    if (/\bschool|college|university\b/.test(lower)) return 'school building or campus';
    return 'simplified explainer stage with large concept props';
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
    if (sceneType === 'introduction') return 'friendly';
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
