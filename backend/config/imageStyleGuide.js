/**
 * Locked visual style for every scene image.
 * Stick figure character + rich conceptual infographic props — never empty character-only frames.
 */

const STYLE_LOCK = `STYLE LOCK — clean hand-drawn 2D stick figure explainer illustration in full color (not black and white). Simple Stickman stick figure (round white head, stick limbs, black waistcoat, white shirt, bow tie) in a clear scene with 2-5 meaningful elements. Flat 2D shapes, bold black outlines, warm muted palette with accent colors — soft cream and tan backgrounds, gentle greens and blues, pink piggy banks, golden coins, colored jars and props. Natural visual storytelling through characters, pose, and environment. Simplified colorful environment with a ground line. No writing anywhere unless the narration explicitly requires visible text. Horizontal 16:9 full-bleed storyboard frame.`;

const VISUAL_STYLE_BLOCK = STYLE_LOCK;

/** Short Fal/Google style anchor. */
const FAL_STYLE_ANCHOR = `Colorful minimalist stick figure doodle explainer illustration — warm muted full-color palette with bold black outlines, not grayscale or monochrome. Clear storyboard scene with 2-5 meaningful elements. Stickman (round head, stick limbs, waistcoat, bow tie) in a simple but colorful environment with a ground line — cream walls, tan furniture, green accents, golden coins, pink props where relevant. NOT black and white. NOT a financial presentation board. NOT blank background. NOT character portrait only. NOT detailed vector human. NOT photorealistic. NOT 3D. NOT anime.`;

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
