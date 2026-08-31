/**
 * Enforces Stickman-only characters in scene text and final image prompts.
 * Image models default to vector humans unless the stick figure rule leads every prompt.
 */

const { CHARACTER_NAME, CHARACTER_SHORT, CHARACTER_LOCK } = require('../config/characterProfile');

const STICKMAN_MANDATE = `MANDATORY — draw ONLY simple stick figures for every person. ${CHARACTER_SHORT}. Round head, stick limbs, waistcoat, bow tie. NO realistic humans. NO detailed cartoon faces. NO vector corporate characters. NO hair, NO beard, NO jeans, NO suits, NO skin shading on the character.`;

const HUMAN_CHARACTER_PATTERN = /\b(man|men|woman|women|boy|girl|person|people|guy|guys|employee|worker|protagonist|narrator|young|teen|adult|male|female)\b/i;
const HUMAN_DETAIL_PATTERN = /\b(hair|beard|stubble|mustache|facial features|skin|jeans|trousers|suit jacket|button.?down|collared shirt|realistic face|vector character|cartoon man|cartoon woman|illustrated person|human figure)\b/i;

const REPLACEMENTS = [
    [/\b(young|old|tall|short)?\s*(man|woman|boy|girl|person|people|male|female|guy|guys|employee|worker|narrator|protagonist)\b/gi, `${CHARACTER_NAME} stick figure`],
    [/\b(men|women)\b/gi, `${CHARACTER_NAME} stick figures`],
    [/\b(he|she|his|her|him)\b/gi, CHARACTER_NAME],
    [/\b(with|has|having)\s+(short|long|dark|black|brown|blonde|messy|spiky)\s+hair\b/gi, ''],
    [/\b(beard|stubble|mustache|facial hair|facial features|realistic face)\b/gi, 'simple line mouth'],
    [/\b(wearing|in)\s+(a\s+)?(gray|grey|black|blue|white|red|navy)\s+(suit|shirt|jeans|trousers|jacket|sweater|dress|blazer)[^,.]*/gi, 'wearing black waistcoat, white shirt, black bow tie'],
    [/\bvector (character|illustration|style)\b/gi, 'stick figure doodle'],
    [/\bdetailed (cartoon|vector|illustrated) (man|woman|person|character)\b/gi, `${CHARACTER_NAME} stick figure`],
    [/\bcorporate (infographic )?character\b/gi, `${CHARACTER_NAME} stick figure`],
];

/**
 * Any hint of writing in the brief makes diffusion models render gibberish letters,
 * so references to text are rewritten into symbol-only equivalents.
 */
const TEXT_REPLACEMENTS = [
    [/\b(a |the )?(sign|signboard|banner|poster|billboard|placard|nameplate|plaque)s?\s+(that\s+)?(reading|saying|says|labell?ed|with the (word|text)s?)[^,.]*/gi, 'a symbol icon'],
    [/\b(labell?ed|labeled|marked|titled|captioned|inscribed|that says|reading)\s+"[^"]*"/gi, 'marked with a symbol'],
    [/\b(labell?ed|labeled|marked|titled|captioned|inscribed|that says|reading)\s+[^,.]*/gi, 'marked with a symbol'],
    [/\b(text|caption|subtitle|headline|title|word|words|letter|letters|writing|handwriting|typography|font)s?\b/gi, 'symbol'],
    [/\bspeech bubble[^,.]*/gi, 'thought bubble containing a small drawn symbol'],
    [/\bthought bubble (with|containing) (the )?(symbol|words?|text)[^,.]*/gi, 'thought bubble containing a small drawn symbol'],
    [/\bnumbers?\b/gi, 'drawn quantity'],
    [/\bdigits?\b/gi, 'drawn quantity'],
    [/\b(display|showing|shows|reads)\s+"[^"]*"/gi, 'showing a symbol'],
    [/"[^"]{0,40}"/g, 'a symbol'],
];

function stripTextReferences(text) {
    let out = String(text || '');
    for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
        out = out.replace(pattern, replacement);
    }
    return out;
}

function sanitizeSceneVisual(text) {
    let out = String(text || '').trim();
    if (!out) return `${CHARACTER_NAME} stick figure in a simplified setting with large metaphor objects.`;

    for (const [pattern, replacement] of REPLACEMENTS) {
        out = out.replace(pattern, replacement);
    }

    out = stripTextReferences(out);

    out = out.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();

    if (!new RegExp(CHARACTER_NAME, 'i').test(out) && !/stick figure/i.test(out)) {
        out = `${CHARACTER_NAME} stick figure: ${out}`;
    }

    return out;
}

function describesHumanCharacter(text) {
    const t = String(text || '');
    return HUMAN_CHARACTER_PATTERN.test(t) || HUMAN_DETAIL_PATTERN.test(t);
}

function enforceStickmanSceneVisual(sceneVisual, narration = '') {
    const raw = String(sceneVisual || '').trim();
    if (!raw) return buildStickmanFallback(narration);

    if (describesHumanCharacter(raw)) {
        console.warn('[Stickman] Scene brief described a human character — sanitizing to stick figure');
        return sanitizeSceneVisual(raw);
    }
    return sanitizeSceneVisual(raw);
}

function buildStickmanFallback(narration = '') {
    const line = String(narration || '').trim();
    if (!line) {
        return `${CHARACTER_NAME} stick figure stands beside large concept icons and a diagram board. Round head, stick limbs, waistcoat, bow tie. Objects fill half the frame.`;
    }
    return `${CHARACTER_NAME} stick figure reacts to the narration among large metaphor objects that illustrate: ${line.slice(0, 120)}. Round head, stick limbs, waistcoat, bow tie. Visible setting with props — not blank. No realistic humans.`;
}

module.exports = {
    STICKMAN_MANDATE,
    CHARACTER_SHORT,
    CHARACTER_LOCK,
    stripTextReferences,
    sanitizeSceneVisual,
    describesHumanCharacter,
    enforceStickmanSceneVisual,
    buildStickmanFallback,
};
