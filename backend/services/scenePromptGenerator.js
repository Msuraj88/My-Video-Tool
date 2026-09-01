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
const { CONCEPT_MANDATE, buildTextMandate, VISUAL_STORYBOARD_RULE, VISUAL_SIMPLICITY_RULE } = require('../utils/storyPromptBuilder');
const { buildApprovedLabel, thinOutLabels } = require('../utils/imageLabel');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-4o-mini';
const TEMPERATURE = 0.25;

const FINANCE_OBJECT_PATTERN = /\b(money|coin|rupee|₹|chart|graph|bank|calculator|invest|salary|interest|debt|loan|budget|percent|emi|credit|stock|piggy|envelope|arrow|diagram|metaphor icon|infographic|presentation|document|calendar)\b/i;

function narrationMentionsFinance(text) {
    return FINANCE_OBJECT_PATTERN.test(String(text || ''));
}

function objectsForNarration(narration, objects) {
    const list = Array.isArray(objects) ? objects : [];
    if (!list.length || narrationMentionsFinance(narration)) return list;
    return list.filter((item) => !FINANCE_OBJECT_PATTERN.test(String(item || '')));
}
const GENERIC_VISUAL_PATTERNS = /\b(laptop|computer|desk|office|sofa|couch|generic room|dim living room)\b/i;
const GENERIC_SCENE_PATTERNS = /\b(large symbolic objects|general_finance|conceptual diagram|gesturing toward large symbolic|explainer stage with large concept)\b/i;
const COMPUTER_NARRATION_PATTERNS = /\b(laptop|computer|desk|office|online|app|website|screen|typing|email)\b/i;
const EMPTY_SCENE_PATTERNS = /\b(blank|empty|solid (blue|color)|plain background|only characters|character lineup|standing in a row)\b/i;
const HAS_OBJECT_PATTERNS = /\b(map|phone|tv|screen|spotlight|arrow|icon|chart|counter|camera|megaphone|banner|bubble|panel|stage|props?|object|diagram)\b/i;

function isGenericSceneVisual(visual, narration) {
    const v = String(visual || '').toLowerCase();
    const n = String(narration || '').toLowerCase();
    if (GENERIC_SCENE_PATTERNS.test(v)) return true;
    if (!GENERIC_VISUAL_PATTERNS.test(v)) return false;
    return !COMPUTER_NARRATION_PATTERNS.test(n);
}

function isConceptEmptyVisual(visual) {
    const v = String(visual || '').toLowerCase();
    if (EMPTY_SCENE_PATTERNS.test(v)) return true;
    if (/\b(stick figure|stickman|character|standing|together|expression|pose|amit|rohan)\b/.test(v)) return false;
    return !HAS_OBJECT_PATTERNS.test(v);
}

function buildNarrationDrivenFallback(narration) {
    const line = String(narration || '').trim();
    if (!line) {
        return `${CHARACTER_NAME} stick figure in a simple explainer environment with a ground line, round head, stick limbs, waistcoat, bow tie.`;
    }
    const direction = generateSceneDirection(line);
    const objects = objectsForNarration(line, direction.objects || []).slice(0, 4);
    const objectPart = objects.length ? ` Visible elements: ${objects.join(', ')}.` : '';
    return `${direction.characters}, ${direction.action}, in ${direction.environment}.${objectPart} Mood: ${direction.emotion}. Stickman style, round head, stick limbs, waistcoat, bow tie.`;
}

function buildNarrationAnchor(narration, direction) {
    if (!direction) return '';
    return `NARRATION ANALYSIS (your scene MUST reflect this — do not ignore):
- Scene type: ${direction.scene_type}
- Characters: ${direction.characters}
- Action: ${direction.action}
- Environment: ${direction.environment}
- Emotion: ${direction.emotion}
- Supporting elements: ${objectsForNarration(narration, direction.objects || []).join(', ') || 'characters and environment from the narration only'}`;
}

const TEXT_RULE = `TEXT: Default to a completely wordless image. Do not add headlines, captions, labels, signs, posters, speech bubbles, chart labels, document text, or decorative typography. Do not invent Hindi, English, fake words, pseudo-text, or numbers on any surface. Only include visible text when the narration explicitly requires it, and use only the exact requested wording. Focus on characters, actions, expressions, objects, and environment.`;

const SYSTEM_PROMPT = `You are a storyboard artist writing concise image prompts for FLUX.2 Klein.

${STICKMAN_MANDATE}

${CONCEPT_MANDATE}

${VISUAL_STORYBOARD_RULE}

${VISUAL_SIMPLICITY_RULE}

${TEXT_RULE}

HARD RULE — CURRENT SCENE NARRATION ONLY:
The image must visually represent ONLY what the current scene narration says.
Do not jump ahead to future investments, stocks, houses, or decisions not yet introduced.
If the narration introduces characters, show those characters together in their environment.
For comparisons, visualize the comparison between the actual characters — not a generic financial presentation board.

PROMPT STYLE FOR FLUX:
- Write in clear natural descriptive language (no SD weights, no ((subject)), no masterpiece/best quality/8k tags).
- Keep the prompt concise: main subject, characters, action, environment, composition, mood/lighting, existing stick-figure explainer style, horizontal 16:9.
- Prefer 2-5 meaningful visual elements. Prioritize characters and actions when they can carry the narration.
- Start with "${CHARACTER_NAME} stick figure", then who/what is in the scene, where they are, and what they are doing.

THE ONLY ALLOWED CHARACTER: ${CHARACTER_NAME} — a simple stick figure (round head, dot eyes, line mouth, stick limbs, waistcoat, bow tie). NEVER describe a realistic human or detailed cartoon person.

Output ONLY the scene brief. No preamble.`;

const FALLBACK_SCENE = buildNarrationDrivenFallback('');

const VISUAL_PLAN_VERSION = 'v11-wordless';

function hashScenes(scenes) {
    return `${VISUAL_PLAN_VERSION}|` + (scenes || [])
        .map((s) => `${s.sceneId}:${String(s.text || '').trim()}`)
        .join('|');
}

/**
 * Reinforces amounts visually without embedding numeric strings that models paint onto the image.
 */
function buildQuantityCue(text) {
    if (!/\b(savings?|लाख|रुपय|₹|amount|balance|income|salary)\b/i.test(String(text || ''))) return null;
    return 'Show the amount visually through equal-height jars or coin stacks — no painted digits or labels.';
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
            const direction = generateSceneDirection(s.text);
            const inferred = objectsForNarration(s.text, direction.objects);
            return {
                sceneId: s.sceneId,
                roleInStory: 'beat',
                concept: s.text,
                visualMetaphor: `${direction.characters}, ${direction.action}`,
                setting: direction.environment,
                keyObjects: inferred,
                quantityCue: buildQuantityCue(s.text),
                textOnImage: null,
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
      "quantityCue": "if the line mentions an amount, how to draw it visually without digits (e.g. equal-height jars); else null",
      "textOnImage": "always null unless the narration explicitly requires visible text on screen (e.g. 'the sign reads COMPOUND')"
    }
  ]
}

Rules:
- Communicate the story idea through natural visual storytelling — not financial infographics.
- Each scene image must represent ONLY that scene's narration. Do not jump ahead to future events or decisions.
- Do NOT add money, coins, rupee symbols, stock charts, bank buildings, calculators, presentation boards, arrows, or finance icons unless that scene's narration explicitly mentions them.
- When the narration compares people or attitudes, plan the comparison between the actual named characters in the same scene.
- keyObjects must come ONLY from what the current narration line actually describes (characters, place, action, or concept named in that line).
- Prefer 2-5 meaningful visual elements. Do not illustrate every noun or abstract concept.
- For character introductions or attitude scenes, keyObjects should be characters, clothing cues, expressions, and environment — not finance symbols.
- textOnImage must be null for ALL scenes unless the narration explicitly requires visible text on screen.
- Never put text on two consecutive scenes.
- textOnImage is at most 2 words or one figure, max 16 characters, English letters/digits only, and must appear verbatim in that narration line. Never a sentence, never Devanagari, never invented wording.
- For each scene, keyObjects should be 2-5 concrete drawable elements from THAT narration only. Characters count as elements.
- NEVER plan a blank background — always a real simplified environment, but keep it uncluttered.
- visualMetaphor should describe natural storyboard action between characters, not a finance slide.
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
            const inferred = objectsForNarration(s.text, generateSceneDirection(s.text).objects);
            const keyObjects = objectsForNarration(
                s.text,
                Array.isArray(planned.keyObjects) && planned.keyObjects.length
                    ? planned.keyObjects.slice(0, 4)
                    : inferred
            );
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
    const direction = line ? generateSceneDirection(line) : null;
    const inferredObjects = objectsForNarration(line, direction?.objects || inferObjects(line));
    const keyObjects = objectsForNarration(
        line,
        (Array.isArray(planned?.keyObjects) && planned.keyObjects.length)
            ? planned.keyObjects
            : inferredObjects
    );
    const quantityCue = planned?.quantityCue || buildQuantityCue(line);
    const label = planned ? (planned.textOnImage || null) : buildApprovedLabel(line);

    const objectsLine = keyObjects.length
        ? `SCENE ELEMENTS (only from this narration): ${keyObjects.join(', ')}\n`
        : '';
    const quantityLine = quantityCue ? `QUANTITY: ${quantityCue}\n` : '';
    const narrationLine = direction
        ? `NARRATION TO VISUALIZE: ${direction.characters}; ${direction.action}; in ${direction.environment}.\n`
        : '';
    const charactersLine = direction ? `CHARACTERS: ${direction.characters}\n` : '';
    const actionLine = direction ? `ACTION: ${direction.action}\n` : '';
    const conceptLine = planned?.concept && planned.concept !== line ? `STORY BEAT: ${planned.concept}\n` : '';
    const metaphorLine = planned?.visualMetaphor && planned.visualMetaphor !== line ? `VISUAL METAPHOR: ${planned.visualMetaphor}\n` : '';
    const settingLine = planned?.setting ? `ENVIRONMENT: ${planned.setting}\n` : (direction ? `ENVIRONMENT: ${direction.environment}\n` : '');
    const labelLine = label
        ? `VISIBLE TEXT (only because narration requires it): "${label}"\n`
        : '';

    return `${buildTextMandate(label)}

${STYLE_LOCK}

${CHARACTER_LOCK}

${CONCEPT_MANDATE}

${VISUAL_STORYBOARD_RULE}

${VISUAL_SIMPLICITY_RULE}

${narrationLine}${charactersLine}${actionLine}${conceptLine}${metaphorLine}${settingLine}${objectsLine}${quantityLine}${labelLine}
SCENE:
${visual}

Consistency: Full-color storyboard scene with warm muted tones and accent colors, clear primary subject, 2-5 meaningful elements, characters prioritized when they carry the narration. ${label ? `Only visible writing: "${label}".` : 'No writing anywhere — colorful drawings only.'}`;
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

    const userPrompt = `Write a concise FLUX.2 Klein image prompt for THIS scene only. ${STICKMAN_MANDATE}

${CONCEPT_MANDATE}

${VISUAL_STORYBOARD_RULE}

${VISUAL_SIMPLICITY_RULE}

${TEXT_RULE}

CRITICAL RULES:
- Show ONLY what the CURRENT NARRATION describes — do not jump ahead.
- Do NOT create financial infographics, charts, presentation boards, calculators, coins, or finance icons unless this narration explicitly mentions them.
- For comparisons, show the actual characters together with their attitudes — not a generic finance slide.
- Prefer 2-5 meaningful visual elements. Prioritize characters and actions.
- Characters: ${direction.characters}
- Action: ${direction.action}
- Environment: ${direction.environment}
- Emotion: ${direction.emotion}
- Use natural descriptive language — no SD-style weights or tags
- Keep the prompt concise and focused

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
KEY OBJECTS (only if mentioned or required by this narration): ${(planned?.keyObjects || direction.objects || []).join(', ') || 'characters and environment from the narration only'}
${quantityCue ? `QUANTITY: ${quantityCue}` : 'QUANTITY: none needed.'}
TEXT: ${label ? `one short label "${label}" only because the narration explicitly requires visible text — do not add any other wording.` : 'no writing anywhere — full-color pictorial scene only.'}

Describe in order: (1) main subject and characters, (2) action, (3) environment, (4) composition and mood.
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
