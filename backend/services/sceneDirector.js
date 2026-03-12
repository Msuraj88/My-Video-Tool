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
    credit_card_payment: 'credit card statement showing balance $0 with a large PAID stamp and green checkmark',
    saving_money: 'person dropping coins into a piggy bank with coins stacking beside it',
    paying_bills: 'person sitting at laptop paying bills online with invoices and paid stamps',
    investing: 'investment chart rising upward with person analyzing financial growth',
    debt: 'credit card bill showing red balance warning and worried expression',
    general_finance: 'person reviewing personal finances on laptop with charts'
};

/** Character action per concept for scene description (Jake = main explainer character). */
const CONCEPT_CHARACTER_ACTIONS = {
    credit_card_payment: 'Jake sitting at a desk paying his credit card bill online',
    saving_money: 'Jake dropping coins into a piggy bank',
    paying_bills: 'Jake sitting at laptop paying bills online',
    investing: 'Jake analyzing financial growth beside an investment chart',
    debt: 'Jake looking at a credit card bill with red balance warning',
    general_finance: 'Jake reviewing personal finances on laptop with charts'
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
    if (!text || typeof text !== 'string') return 'person';
    const lower = text.toLowerCase();
    if (/\btwo brothers|brothers\b/.test(lower)) return 'two young brothers';
    if (/\bsiblings|sisters\b/.test(lower)) return 'siblings';
    if (/\bamerican family|family of four|family\b/.test(lower)) return 'family of four';
    if (/\bfamily\b/.test(lower)) return 'family';
    if (/\bcrowd|people|everyone|many\b/.test(lower)) return 'group of people';
    if (/\bwoman|female\b/.test(lower)) return 'woman';
    if (/\bman\b/.test(lower)) return 'man';
    if (/\bworker|employee|driver\b/.test(lower)) return 'person';
    return 'person';
}

/**
 * Infers main action from narration (verb-focused).
 * @param {string} text
 * @returns {string}
 */
function inferAction(text) {
    if (!text || typeof text !== 'string') return 'explaining the concept';
    const lower = text.toLowerCase();
    if (/\bgrew up|growing up\b/.test(lower)) return 'standing in front of their house together';
    if (/\bthrows? away|throwing away\b/.test(lower)) return 'throwing groceries into trash bin';
    if (/\b(reached|reaches?|paying|payment)\b/.test(lower)) return 'standing beside car or payment chart looking concerned';
    if (/\bspend|spending\b/.test(lower)) return 'spending or handling money';
    if (/\bsave|saving\b/.test(lower)) return 'saving money or placing into piggy bank';
    if (/\bwaste|wasting\b/.test(lower)) return 'discarding or wasting resources';
    if (/\bcompare|comparing\b/.test(lower)) return 'comparing two options or concepts';
    if (/\bshow|showing|demonstrate\b/.test(lower)) return 'demonstrating or showing the concept';
    return 'presenting or explaining the concept visually';
}

/**
 * Infers concrete objects to show in the scene.
 * @param {string} text
 * @param {string} sceneType
 * @returns {string[]}
 */
function inferObjects(text, sceneType) {
    if (!text || typeof text !== 'string') return ['concept icon'];
    const lower = text.toLowerCase();
    const objects = [];
    if (/\bfood|groceries|bread|apple|vegetables|fruit\b/.test(lower)) {
        objects.push('bread', 'apple', 'vegetables');
    }
    if (/\btrash|throw away|waste\b/.test(lower)) objects.push('trash can');
    if (/\bhouse|home|same house\b/.test(lower)) objects.push('house', 'suburban home');
    if (/\bcar|vehicle|payment|auto\b/.test(lower)) objects.push('car');
    if (/\bmoney|dollar|\$|payment|cost\b/.test(lower)) objects.push('money or payment graphic');
    if (/\bbudget|save|bank\b/.test(lower)) objects.push('piggy bank or chart');
    if (/\bpercent|%\b/.test(lower)) objects.push('percentage graphic');
    if (objects.length === 0) objects.push('concept icon', 'simple diagram');
    return [...new Set(objects)].slice(0, 5);
}

/**
 * Infers environment/setting from narration.
 * @param {string} text
 * @returns {string}
 */
function inferEnvironment(text) {
    if (!text || typeof text !== 'string') return 'simple modern room';
    const lower = text.toLowerCase();
    if (/\bhouse|home|same house|grew up\b/.test(lower)) return 'suburban house';
    if (/\bkitchen|food|groceries|throw away\b/.test(lower)) return 'kitchen';
    if (/\bcar|garage|driveway|suburban|payment\b/.test(lower)) return 'simple suburban house background';
    if (/\boffice|work|business\b/.test(lower)) return 'simple office';
    if (/\bstore|shop|buy\b/.test(lower)) return 'store';
    if (/\bschool|college|university\b/.test(lower)) return 'school building or campus';
    return 'minimal clean background';
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
    detectVisualConcept,
    buildSceneDescriptionFromSentence,
    VISUAL_SCENE_TEMPLATES,
    CONCEPT_CHARACTER_ACTIONS,
    CONCEPT_EXPRESSIONS,
    SCENE_TYPES
};
