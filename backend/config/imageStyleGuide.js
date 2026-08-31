/**
 * Locked visual style for every scene image.
 * Stick figure character + rich conceptual infographic props — never empty character-only frames.
 */

const STYLE_LOCK = `STYLE LOCK — stick figure explainer infographic. Simple black-ink Stickman stick figure (round head, stick limbs, waistcoat, bow tie) PLUS large clear concept objects that explain the narration (coin stacks, growth curves, snowballs, piggy banks, arrows, comparison panels, icons). Flat 2D shapes, bold outlines, muted cool blues/grays with a few accent colors on icons. Always a simplified environment with a ground line. NEVER empty solid background with only characters. NEVER detailed vector humans. At most ONE short correctly-spelled label in bold uppercase block letters — never sentences, captions, or gibberish. 16:9 full-bleed storyboard frame.`;

const VISUAL_STYLE_BLOCK = STYLE_LOCK;

/** Short Fal/Google style anchor. */
const FAL_STYLE_ANCHOR = `Minimalist stick figure doodle explainer infographic — like xkcd stick figures inside a rich conceptual storyboard. Stickman (round head, stick limbs, waistcoat, bow tie) interacting with large metaphor objects, icons, and shapes that explain the idea. Simplified environment with a ground line behind them. At most one short, correctly spelled uppercase label. NOT blank background. NOT character portrait only. NOT detailed vector human. NOT photorealistic. NOT 3D. NOT anime.`;

const STYLE_AVOID = `Avoid:
gibberish text
fake letters
misspelled words
captions
sentences
Chinese characters
Devanagari
empty blank background
plain solid color only
characters alone with no props
photorealistic
3D render
realistic photo
detailed vector human
corporate infographic character
cartoon man with hair
beard
webtoon character
anime character
different character
different art style`;

const NEGATIVE_PROMPT = `gibberish text
fake letters
garbled writing
misspelled words
random characters
nonsense lettering
paragraphs of text
sentences
captions
subtitles
cluttered text everywhere
text on every object
handwriting
Chinese characters
Japanese characters
Korean characters
Devanagari
Hindi script
empty blank background
plain solid color only
characters alone
no props
no icons
character portrait only
photorealistic
3D render
realistic photo
hyperrealistic
realistic human
detailed human
vector character with hair
corporate infographic person
illustrated person
cartoon man
cartoon woman
detailed cartoon face
facial features
realistic face
shaded skin
hair
beard
stubble
mustache
jeans
suit jacket
button down shirt
webtoon character
anime character
different character
different art style
blurred
blurry
low resolution
watermark
logo
Devanagari
Hindi script`;

module.exports = {
    STYLE_LOCK,
    VISUAL_STYLE_BLOCK,
    STYLE_AVOID,
    NEGATIVE_PROMPT,
    FAL_STYLE_ANCHOR,
};
