/**
 * OpenAI-powered scene prompt generator.
 * 1) Understand the FULL script (visual plan).
 * 2) Write each scene brief from that plan so concepts stay coherent.
 */

const OpenAI = require('openai');
const { CHARACTER_NAME, CHARACTER_LOCK } = require('../config/characterProfile');
const { STYLE_LOCK } = require('../config/imageStyleGuide');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-4o-mini';
const TEMPERATURE = 0.35;

const TEXT_RULE = `TEXT ON IMAGE — most scenes have ZERO writing. Add text only when the visual plan marks needsText, or when a single key number must appear (account balance, Rs amount, a chart value). If text is used: write it in Hinglish or English only (example: "Rs 50,000", "locker", "safe", "bank balance") — NEVER Devanagari / pure Hindi letters. Place that one label ONCE on the single most meaningful object (thought bubble, phone screen, or one chart). No labels on lockers, furniture, books, or walls. Do not write the full narration sentence.`;

const SYSTEM_PROMPT = `You are a storyboard director for a conceptual 2D-outline explainer series.

THE CHARACTER AND ART STYLE ARE ALREADY LOCKED. Do not describe hair, skin, outfit, or line style. Do not rename or redesign the character. He is always ${CHARACTER_NAME}, the same young man in the navy sweater.

You receive (1) a visual plan of the WHOLE video and (2) the current scene. Design this frame so it continues that story — not an isolated clip.

ART DIRECTION:
- Clean 2D vector outline, bold black outlines, flat cel-shading, muted cool blues and grays.
- Conceptual objects explain the idea. Prefer objects over words.
- Character lives inside a simplified environment.

WHAT TO DESIGN:
1. SETTING — follow the plan's setting for this scene; keep recurring locations consistent with the throughline.
2. POSE + MOOD — match this scene's role in the story. Vary pose vs other scenes.
3. CONCEPT VISUALS — 2–4 large objects from the plan (locker, phone, house, shop, coins, chart, thought bubble). Unlabeled unless needsText.
4. TEXT — ${TEXT_RULE}
5. COMPOSITION — 16:9, one hero only.

Output ONLY the scene brief. No preamble.`;

const FALLBACK_SCENE = `${CHARACTER_NAME} sits on a gray sofa in a dim living room at night, navy sweater, laptop on a brown pillow, calm half-lidded expression. Simple unlabeled objects. No captions.`;

function hashScenes(scenes) {
    return (scenes || [])
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

function toHinglishLabel(value) {
    if (!value) return null;
    return String(value)
        .replace(/₹/g, 'Rs ')
        .replace(/[\u0900-\u097F]+/g, '')
        .replace(/\s+/g, ' ')
        .trim() || null;
}

async function analyzeScriptVisualPlan(script, scenes) {
    const list = (scenes || [])
        .map((s, i) => `${i + 1}. [${s.sceneId}] ${s.text}`)
        .join('\n');

    const fallback = {
        storySummary: String(script || '').slice(0, 400),
        throughline: 'Same character explains the idea with clear conceptual objects.',
        world: 'Muted 2D outline interiors that fit the topic.',
        scenes: (scenes || []).map((s) => ({
            sceneId: s.sceneId,
            roleInStory: 'beat',
            concept: s.text,
            setting: 'simplified interior that fits the line',
            keyObjects: [],
            needsText: extractKeyFigures(s.text).length > 0,
            textOnImage: extractKeyFigures(s.text)[0] || null,
            textPlacement: extractKeyFigures(s.text).length ? 'thought bubble or phone screen' : null,
        })),
        sourceHash: hashScenes(scenes),
    };

    try {
        const response = await openai.chat.completions.create({
            model: MODEL,
            temperature: 0.3,
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
      "setting": "specific place, consistent with the world",
      "keyObjects": ["2-4 objects that show the idea"],
      "needsText": false,
      "textOnImage": null,
      "textPlacement": null
    }
  ]
}

Rules:
- needsText is true ONLY if a number, app UI, or a short label is required to understand the beat (e.g. a bank balance). Most scenes: needsText false, textOnImage null.
- textOnImage must be Hinglish or English (Rs 50,000, locker, bank balance). Never Devanagari.
- Keep the same character world across scenes. Vary pose and setting as the story moves.
- scenes array MUST include every sceneId from the input, in order.`,
                },
                {
                    role: 'user',
                    content: `FULL SCRIPT:\n${script || ''}\n\nNUMBERED SCENES:\n${list}`,
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
            const needsText = Boolean(planned.needsText);
            return {
                sceneId: s.sceneId,
                roleInStory: planned.roleInStory || 'beat',
                concept: planned.concept || s.text,
                setting: planned.setting || fallback.world,
                keyObjects: Array.isArray(planned.keyObjects) ? planned.keyObjects.slice(0, 4) : [],
                needsText,
                textOnImage: needsText ? toHinglishLabel(planned.textOnImage) : null,
                textPlacement: needsText ? (planned.textPlacement || 'one object only') : null,
            };
        });
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
    const figures = extractKeyFigures(line);
    const needsText = planned ? Boolean(planned.needsText) : figures.length > 0;
    const label = needsText
        ? (toHinglishLabel(planned?.textOnImage) || figures[0] || null)
        : null;

    const textLine = label
        ? `ON-IMAGE TEXT (Hinglish/English only, once): "${label}" at ${planned?.textPlacement || 'one object'}. No other writing. No Devanagari.\n`
        : 'ON-IMAGE TEXT: none. No letters, no Hindi script, no captions, no labels on objects.\n';
    const narrationLine = line ? `NARRATION TO VISUALIZE: "${line}"\n` : '';
    const conceptLine = planned?.concept ? `STORY BEAT: ${planned.concept}\n` : '';

    return `${STYLE_LOCK}

${CHARACTER_LOCK}

${narrationLine}${conceptLine}${textLine}
${TEXT_RULE}

SCENE (pose, setting, conceptual objects — do not change the character design):
${visual}

Consistency: same character, same navy sweater, same 2D outline style as every other scene. One hero only. Explain with objects. Writing only if listed above, in Hinglish or English.`;
}

async function generateScenePrompt(sentence, options = {}) {
    const trimmed = (sentence && typeof sentence === 'string') ? sentence.trim() : '';
    const visualPlan = options.visualPlan || null;
    const planned = findPlannedScene(visualPlan, options.sceneId, options.sceneIndex);
    const figures = extractKeyFigures(trimmed);
    const needsText = planned ? Boolean(planned.needsText) : figures.length > 0;
    const label = needsText
        ? (toHinglishLabel(planned?.textOnImage) || figures[0] || null)
        : null;

    const neighbors = (visualPlan?.scenes || [])
        .map((s, i) => `${i + 1}. [${s.roleInStory}] ${s.concept}`)
        .join('\n');

    const userPrompt = `Write the scene brief for THIS beat of the full story. Do not describe hair, clothes, or art style.

WHOLE-STORY SUMMARY: ${visualPlan?.storySummary || 'A conceptual explainer.'}
THROUGHLINE: ${visualPlan?.throughline || 'Same character, conceptual objects.'}
WORLD: ${visualPlan?.world || 'Muted 2D outline interiors.'}

ALL BEATS:
${neighbors || '(single scene)'}

CURRENT SCENE ID: ${options.sceneId || 'scene'}
CURRENT NARRATION: "${trimmed || 'He explains a key idea.'}"
ROLE IN STORY: ${planned?.roleInStory || 'beat'}
CONCEPT TO SHOW: ${planned?.concept || trimmed}
SETTING: ${planned?.setting || 'fit the narration'}
KEY OBJECTS: ${(planned?.keyObjects || []).join(', ') || 'choose 2-4 conceptual objects'}
${label
        ? `TEXT: one Hinglish/English label "${label}" on ${planned?.textPlacement || 'one object'}. No Devanagari. Nothing else written.`
        : 'TEXT: none. No writing anywhere in the image.'}

Include setting, ${CHARACTER_NAME}'s pose/mood, and the conceptual objects. 16:9, one hero.
Output the brief only.`;

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
            : FALLBACK_SCENE;
    } catch (err) {
        console.error('OpenAI scene prompt generation failed, using fallback:', err.message);
        sceneVisual = FALLBACK_SCENE;
    }

    const imagePrompt = buildFinalImagePrompt(sceneVisual, trimmed, planned);

    console.log('Scene narration:', trimmed || '(empty)');
    console.log('Generated scene visual:', sceneVisual);

    return imagePrompt;
}

module.exports = {
    generateScenePrompt,
    buildFinalImagePrompt,
    analyzeScriptVisualPlan,
    ensureVisualPlan,
    hashScenes,
};
