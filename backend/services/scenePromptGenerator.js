/**
 * OpenAI-powered scene prompt generator.
 * 1) Understand the FULL script (visual plan).
 * 2) Write each scene brief from that plan so concepts stay coherent.
 */

const OpenAI = require('openai');
const { CHARACTER_NAME, CHARACTER_LOCK } = require('../config/characterProfile');
const { STYLE_LOCK } = require('../config/imageStyleGuide');
const {
    generateSceneDirection,
    buildSceneDescriptionFromSentence,
    inferObjects,
} = require('./sceneDirector');
const {
    enforceStickmanSceneVisual,
    STICKMAN_MANDATE,
} = require('../utils/stickmanPrompt');
const { CONCEPT_MANDATE, buildTextMandate } = require('../utils/storyPromptBuilder');
const { buildApprovedLabel, thinOutLabels } = require('../utils/imageLabel');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-4o-mini';
const TEMPERATURE = 0.25;

const GENERIC_VISUAL_PATTERNS = /\b(laptop|computer|desk|office|sofa|couch|generic room|dim living room)\b/i;
const COMPUTER_NARRATION_PATTERNS = /\b(laptop|computer|desk|office|online|app|website|screen|typing|email)\b/i;
const EMPTY_SCENE_PATTERNS = /\b(blank|empty|solid (blue|color)|plain background|only characters|character lineup|standing in a row)\b/i;
const HAS_OBJECT_PATTERNS = /\b(map|phone|tv|screen|spotlight|arrow|icon|chart|counter|camera|megaphone|banner|bubble|panel|stage|props?|object|diagram)\b/i;

function isGenericSceneVisual(visual, narration) {
    const v = String(visual || '').toLowerCase();
    const n = String(narration || '').toLowerCase();
    if (!GENERIC_VISUAL_PATTERNS.test(v)) return false;
    return !COMPUTER_NARRATION_PATTERNS.test(n);
}

function isConceptEmptyVisual(visual) {
    const v = String(visual || '').toLowerCase();
    if (EMPTY_SCENE_PATTERNS.test(v)) return true;
    return !HAS_OBJECT_PATTERNS.test(v);
}

function buildNarrationDrivenFallback(narration) {
    const line = String(narration || '').trim();
    if (!line) {
        return `${CHARACTER_NAME} stick figure stands in a simplified explainer stage with large conceptual icons and a diagram board, round head, stick limbs, waistcoat, bow tie.`;
    }
    const direction = generateSceneDirection(line);
    const { sceneDescription } = buildSceneDescriptionFromSentence(line);
    const objects = (direction.objects || []).join(', ');
    return `${CHARACTER_NAME} stick figure in ${direction.environment}, ${direction.action}. Round head, stick limbs, waistcoat, bow tie. LARGE visible objects filling half the frame: ${objects}. Mood: ${direction.emotion}. ${sceneDescription}. Not a blank background.`;
}

function buildNarrationAnchor(narration, direction) {
    if (!direction) return '';
    return `NARRATION ANALYSIS (your scene MUST reflect this — do not ignore):
- Scene type: ${direction.scene_type}
- Action: ${direction.action}
- Environment: ${direction.environment}
- Emotion: ${direction.emotion}
- Required objects: ${(direction.objects || []).join(', ') || 'conceptual metaphor objects from the narration'}`;
}

const TEXT_RULE = `TEXT IS STRICTLY LIMITED — at most ONE short label per image, and it is chosen by the pipeline, not by you. Do NOT invent captions, sentences, signage, screen text, or written speech bubbles in your brief. Do not write any Devanagari. Describe objects and poses; the single approved label is added separately.`;

const SYSTEM_PROMPT = `You are an EDUCATOR-DIRECTOR storyboarding a minimalist STICK FIGURE explainer series. Your job is to translate each narration line into a visual that teaches the idea almost entirely through drawings.

${STICKMAN_MANDATE}

${CONCEPT_MANDATE}

${TEXT_RULE}

THE ONLY ALLOWED CHARACTER: ${CHARACTER_NAME} — a simple stick figure (round head, dot eyes, line mouth, stick limbs, waistcoat, bow tie). NEVER describe a realistic human or detailed cartoon person.

FORBIDDEN character words: man, woman, person, people, boy, girl, young, hair, beard, jeans, suit, skin, vector character.
FORBIDDEN scene words: text, label, sign, caption, writing, words, title, number, digits, "reading", "that says".

HOW AN EDUCATOR DESIGNS THE FRAME:
1. Ask: what must the viewer UNDERSTAND after this line? (not "what is being said")
2. Choose ONE governing metaphor that teaches it visually.
   - growth over time → a rising staircase or curve of coin stacks getting taller
   - compounding → a small pile spawning more piles, snowball rolling and growing
   - income → an arrow flowing from a source into a container
   - comparison → two side-by-side panels of clearly different sizes
   - misunderstanding → tangled lines vs one straight clean line
3. Build a REAL ENVIRONMENT around it (bank hall, park, kitchen table, street, office corner) with a floor line, background shapes, and depth — never a floating void.
4. Place ${CHARACTER_NAME} inside the environment reacting to the metaphor (pointing, leaning back surprised, watching the pile grow).

WHAT TO DESIGN:
1. SETTING — a specific simplified place with a ground line and background shapes.
2. STICK FIGURE POSE — how ${CHARACTER_NAME} physically reacts to the metaphor.
3. CONCEPT VISUALS — 2–4 LARGE drawn metaphor objects, named concretely (coin stacks of increasing height, snowball, growth curve, piggy bank, calendar pages, funnel).
4. TEXT — ${TEXT_RULE}
5. COMPOSITION — 16:9 storyboard: character among objects, objects fill half the frame.

Start with "${CHARACTER_NAME} stick figure", then the setting, then the large metaphor objects.

Output ONLY the scene brief. No preamble.`;

const FALLBACK_SCENE = buildNarrationDrivenFallback('');

const VISUAL_PLAN_VERSION = 'v7-sparse-label';

function hashScenes(scenes) {
    return `${VISUAL_PLAN_VERSION}|` + (scenes || [])
        .map((s) => `${s.sceneId}:${String(s.text || '').trim()}`)
        .join('|');
}

function extractKeyFigures(text) {
    if (!text || typeof text !== 'string') return [];
    const found = [];
    const rupee = text.match(/₹\s*[\d,]+(?:\.\d+)?/g);
    const dollar = text.match(/\$\s*[\d,]+(?:\.\d+)?/g);
    const percent = text.match(/\d+(?:\.\d+)?%/g);
    if (rupee) found.push(...rupee.map((s) => s.replace(/\s+/g, '').replace('₹', 'Rs ')));
    if (dollar) found.push(...dollar.map((s) => s.replace(/\s+/g, '')));
    if (percent) found.push(...percent);
    return [...new Set(found)].slice(0, 2);
}

/**
 * Amounts are reinforced visually as well as textually, so the figure stays understandable
 * even when the model renders the label imperfectly.
 */
function buildQuantityCue(text) {
    const figures = extractKeyFigures(text);
    if (!figures.length) return null;
    return `Also show the amount visually (a stack of coins or a filled jar whose height represents ${figures[0]}), so the quantity reads even at a glance.`;
}

async function analyzeScriptVisualPlan(script, scenes) {
    const list = (scenes || [])
        .map((s, i) => `${i + 1}. [${s.sceneId}] ${String(s.text || '').slice(0, 200)}`)
        .join('\n');

    // Guard against excessively large scripts (OpenAI context limit)
    const scriptForAnalysis = String(script || '').slice(0, 8000);

    const fallback = {
        storySummary: String(script || '').slice(0, 400),
        throughline: 'Same character explains the idea with clear conceptual objects.',
        world: 'Muted 2D outline interiors that fit the topic.',
        scenes: (scenes || []).map((s) => {
            const inferred = inferObjects(s.text);
            return {
                sceneId: s.sceneId,
                roleInStory: 'beat',
                concept: s.text,
                visualMetaphor: `Show the idea wordlessly with: ${inferred.join(', ')}`,
                setting: 'simplified explainer environment with a ground line and background shapes',
                keyObjects: inferred,
                quantityCue: buildQuantityCue(s.text),
                textOnImage: buildApprovedLabel(s.text),
            };
        }),

        sourceHash: hashScenes(scenes),
    };

    try {
        const response = await openai.chat.completions.create({
            model: MODEL,
            temperature: 0.3,
            max_tokens: 4096,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `You are a conceptual storyboard director. Read the COMPLETE script first, understand the argument and visual story, then plan every scene so images form one coherent film — not disconnected clips.

Return JSON only:
{
  "storySummary": "2-4 sentences: what the whole video is saying",
  "throughline": "one-line visual story",
  "world": "recurring places and props to reuse",
  "scenes": [
    {
      "sceneId": "scene-001",
      "roleInStory": "hook | setup | misconception | twist | example | payoff",
      "concept": "what THIS frame must make the viewer understand, in English",
      "visualMetaphor": "one sentence: show [idea] as [concrete drawable objects/scene], wordlessly",
      "setting": "specific place with a ground line and background shapes, consistent with the world",
      "keyObjects": ["2-4 drawable objects that teach the idea — must relate to THIS narration line"],
      "quantityCue": "if the line mentions an amount, how to also draw it (e.g. tall stack of coins); else null",
      "textOnImage": "usually null. Only set it when ONE word must be highlighted to understand the beat, and that exact word appears in the line (e.g. 'COMPOUND', '8%')"
    }
  ]
}

Rules:
- textOnImage must be null for MOST scenes. Text is rare and reserved for a genuinely pivotal word or an amount. If the drawing can carry the meaning, use null.
- Never put text on two consecutive scenes.
- textOnImage is at most 2 words or one figure, max 16 characters, English letters/digits only, and must appear verbatim in that narration line. Never a sentence, never Devanagari, never invented wording.
- Amounts should ALSO be drawn as quantities (stack height, pile size, bar height) so the meaning survives without reading.
- For each scene, keyObjects MUST be 2–4 concrete drawable metaphor objects from THAT narration (e.g. rising coin stacks, snowball growing, funnel of money, calendar pages, growth curve). NEVER leave keyObjects empty.
- NEVER plan a blank background with only stick figures — always a real simplified environment.
- visualMetaphor is mandatory: one concrete "draw this" sentence a storyboard artist could follow without reading Hindi.
- Think like an educator: the frame must TEACH the idea, not just decorate the sentence.
- Keep the same Stickman stick figure world across scenes. Every person is the same simple stick figure design.
- scenes array MUST include every sceneId from the input, in order.`,
                },
                {
                    role: 'user',
                    content: `FULL SCRIPT:\n${scriptForAnalysis}\n\nNUMBERED SCENES:\n${list}`,
                },
            ],
        });

        const raw = response.choices[0]?.message?.content;
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || !Array.isArray(parsed.scenes)) {
            return fallback;
        }

        const byId = new Map(parsed.scenes.map((s) => [s.sceneId, s]));
        parsed.scenes = (scenes || []).map((s) => {
            const planned = byId.get(s.sceneId) || {};
            const inferred = inferObjects(s.text);
            const keyObjects = Array.isArray(planned.keyObjects) && planned.keyObjects.length
                ? planned.keyObjects.slice(0, 4)
                : inferred;
            return {
                sceneId: s.sceneId,
                roleInStory: planned.roleInStory || 'beat',
                concept: planned.concept || s.text,
                visualMetaphor: planned.visualMetaphor || planned.concept || s.text,
                setting: planned.setting || fallback.world,
                keyObjects,
                quantityCue: planned.quantityCue || buildQuantityCue(s.text),
                textOnImage: buildApprovedLabel(s.text, planned.textOnImage),
            };
        });
        parsed.scenes = thinOutLabels(parsed.scenes, scenes);
        parsed.sourceHash = hashScenes(scenes);
        console.log('Visual plan ready:', parsed.throughline || parsed.storySummary);
        return parsed;
    } catch (err) {
        console.error('Script visual plan failed, using fallback:', err.message);
        return fallback;
    }
}

async function ensureVisualPlan(project) {
    const hash = hashScenes(project.scenes);
    if (project.visualPlan && project.visualPlan.sourceHash === hash) {
        return project.visualPlan;
    }
    console.log('Understanding complete script before writing scene prompts...');
    project.visualPlan = await analyzeScriptVisualPlan(project.script, project.scenes);
    return project.visualPlan;
}

function findPlannedScene(visualPlan, sceneId, sceneIndex) {
    const list = visualPlan?.scenes || [];
    return list.find((s) => s.sceneId === sceneId) || list[sceneIndex] || null;
}

function buildFinalImagePrompt(sceneVisual, narration = '', planned = null) {
    const visual = (sceneVisual && sceneVisual.trim()) ? sceneVisual.trim() : FALLBACK_SCENE;
    const line = (narration && narration.trim()) ? narration.trim() : '';
    const inferredObjects = inferObjects(line);
    const keyObjects = (Array.isArray(planned?.keyObjects) && planned.keyObjects.length)
        ? planned.keyObjects
        : inferredObjects;
    const quantityCue = planned?.quantityCue || buildQuantityCue(line);
    // The plan already thinned labels across the timeline, so trust it when present.
    const label = planned ? (planned.textOnImage || null) : buildApprovedLabel(line);

    const objectsLine = `CONCEPT OBJECTS (must appear in frame): ${keyObjects.join(', ')}\n`;
    const quantityLine = quantityCue ? `QUANTITY: ${quantityCue}\n` : '';
    const narrationLine = line ? `NARRATION TO VISUALIZE: "${line}"\n` : '';
    const conceptLine = planned?.concept ? `STORY BEAT: ${planned.concept}\n` : '';
    const metaphorLine = planned?.visualMetaphor ? `VISUAL METAPHOR: ${planned.visualMetaphor}\n` : '';
    const settingLine = planned?.setting ? `ENVIRONMENT: ${planned.setting}\n` : '';
    const labelLine = label
        ? `ON-IMAGE TEXT (the ONLY text allowed, exactly once): "${label}"\n`
        : 'ON-IMAGE TEXT: none.\n';

    return `${buildTextMandate(label)}

${STYLE_LOCK}

${CHARACTER_LOCK}

${CONCEPT_MANDATE}

${narrationLine}${conceptLine}${metaphorLine}${settingLine}${objectsLine}${quantityLine}${labelLine}
SCENE (Stickman stick figure pose + environment + large concept objects — NO empty background):
${visual}

Consistency: Stickman stick figure inside a real simplified environment among LARGE metaphor objects. ${label ? `The single label "${label}" is the only lettering in the image.` : 'No lettering anywhere in the image.'}`;
}

async function generateScenePrompt(sentence, options = {}) {
    const trimmed = (sentence && typeof sentence === 'string') ? sentence.trim() : '';
    const visualPlan = options.visualPlan || null;
    const planned = findPlannedScene(visualPlan, options.sceneId, options.sceneIndex);
    const previousScenes = Array.isArray(options.previousScenes) ? options.previousScenes : [];
    const quantityCue = planned?.quantityCue || buildQuantityCue(trimmed);
    const label = planned ? (planned.textOnImage || null) : buildApprovedLabel(trimmed);

    const direction = generateSceneDirection(trimmed);
    const narrationAnchor = buildNarrationAnchor(trimmed, direction);

    const neighbors = (visualPlan?.scenes || [])
        .map((s, i) => `${i + 1}. [${s.roleInStory}] ${s.concept}`)
        .join('\n');

    const previousLines = previousScenes.length
        ? previousScenes.map((s, i) => {
            const narration = String(s.text || s.narration || '').slice(0, 100);
            const visual = String(s.sceneVisual || s.setting || 'unspecified').slice(0, 140);
            return `${i + 1}. Narration: "${narration}" | Visual: ${visual}`;
        }).join('\n')
        : '(none — first scene)';

    const userPrompt = `Write the scene brief for THIS beat as an educator-director. ${STICKMAN_MANDATE}

${CONCEPT_MANDATE}

${TEXT_RULE}

CRITICAL RULES:
- Start with "${CHARACTER_NAME} stick figure"
- NEVER use words: man, woman, person, people, hair, beard, jeans, suit, vector character
- NEVER invent captions, signage, or written speech bubbles — one approved label is added separately by the pipeline
- NEVER describe only characters on a blank background — build a real simplified environment with a ground line
- MUST include 2–4 LARGE named metaphor objects that TEACH the narration idea
- Objects should take roughly half the frame
- A viewer who hears nothing and reads nothing must still understand the lesson

${narrationAnchor}

WHOLE-STORY SUMMARY: ${visualPlan?.storySummary || 'A conceptual explainer.'}
THROUGHLINE: ${visualPlan?.throughline || 'Same stick figure, conceptual objects.'}
WORLD: ${visualPlan?.world || 'Simplified explainer stages with props.'}

ALL BEATS:
${neighbors || '(single scene)'}

PREVIOUS SCENES ALREADY GENERATED — do NOT repeat the same empty lineup of stick figures:
${previousLines}
Choose a fresh setting, pose, and prop layout for THIS scene.

CURRENT SCENE ID: ${options.sceneId || 'scene'}
CURRENT NARRATION: "${trimmed || 'He explains a key idea.'}"
ROLE IN STORY: ${planned?.roleInStory || 'beat'}
CONCEPT TO SHOW: ${planned?.concept || trimmed}
VISUAL METAPHOR: ${planned?.visualMetaphor || planned?.concept || 'translate the narration into visible objects'}
SETTING: ${planned?.setting || 'a specific simplified place with ground line and background shapes'}
KEY OBJECTS (must all appear LARGE): ${(planned?.keyObjects || direction.objects || []).join(', ') || 'choose 2-4 conceptual metaphor objects that match THIS narration only'}
${quantityCue ? `QUANTITY: ${quantityCue}` : 'QUANTITY: none needed.'}
TEXT: ${label ? `one short label "${label}" will be placed on the main object — do not add any other wording.` : 'none — do not describe any wording.'}

Describe in order: (1) the environment with ground line and background shapes, (2) ${CHARACTER_NAME} stick figure pose reacting to the metaphor, (3) the 2–4 large metaphor objects by name.
Start with "${CHARACTER_NAME} stick figure". Output the brief only.`;

    let sceneVisual;
    try {
        const response = await openai.chat.completions.create({
            model: MODEL,
            temperature: TEMPERATURE,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ]
        });

        const content = response.choices[0]?.message?.content;
        sceneVisual = (content && typeof content === 'string' && content.trim().length > 0)
            ? content.trim()
            : buildNarrationDrivenFallback(trimmed);
    } catch (err) {
        console.error('OpenAI scene prompt generation failed, using fallback:', err.message);
        sceneVisual = buildNarrationDrivenFallback(trimmed);
    }

    if (isGenericSceneVisual(sceneVisual, trimmed)) {
        console.warn('Scene brief too generic for narration — using narration-driven fallback');
        sceneVisual = buildNarrationDrivenFallback(trimmed);
    }

    if (isConceptEmptyVisual(sceneVisual)) {
        console.warn('Scene brief missing concept objects — injecting narration-driven objects');
        sceneVisual = buildNarrationDrivenFallback(trimmed);
    }

    sceneVisual = enforceStickmanSceneVisual(sceneVisual, trimmed);

    const imagePrompt = buildFinalImagePrompt(sceneVisual, trimmed, planned);

    console.log('Scene narration:', trimmed || '(empty)');
    console.log('Generated scene visual:', sceneVisual);

    return { imagePrompt, sceneVisual };
}

module.exports = {
    generateScenePrompt,
    buildFinalImagePrompt,
    buildNarrationDrivenFallback,
    analyzeScriptVisualPlan,
    ensureVisualPlan,
    hashScenes,
};
