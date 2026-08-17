/**
 * Locked visual style for every scene image.
 * Matches the 2D outline / lo-fi webtoon reference: bold outlines, cel-shading, muted cool palette,
 * conceptual infographic storytelling (character + objects + graphs + UI + short labels).
 */

const STYLE_LOCK = `STYLE LOCK — same 2D outline look in every scene. Clean 2D vector outline illustration, webcomic / lo-fi explainer aesthetic. Uniform bold black outlines on the character, furniture, props, charts, and UI. Flat cel-shading, distinct shadow shapes, no gradients, no photorealism, no 3D render. Muted cool palette: desaturated blues, charcoal grays, dark browns, pale laptop/phone screen glow. Conceptual scene: character plus a few large clear objects that show the idea. Almost no writing in the picture. 16:9 full-bleed composition, character integrated into a simplified environment, not a blank void.`;

const VISUAL_STYLE_BLOCK = STYLE_LOCK;

const STYLE_AVOID = `Avoid:
photorealistic
3D render
realistic photo
anime chibi
kids cartoon
vibrant neon colors
complex gradients
plain empty background
different character
white collared shirt
brown hair
beard`;

const NEGATIVE_PROMPT = `photorealistic
3D render
realistic photo
hyperrealistic
cinematic live action
complex gradients
realistic skin pores
anime chibi
kids cartoon
childish
blurred
blurry
low resolution
different character
brown hair
stubble beard
white collared shirt
suit and tie
inconsistent outfit
inconsistent hairstyle
two people
duplicate character
multiple characters
multiple faces
extra limbs
distorted face
deformed face
bad anatomy
watermark
logo
signature
stock photo
        clip art
repeated text
duplicate numbers
floating numbers
text on every object
labels on furniture
random captions
watermark text
Devanagari
Hindi script
Nagari letters`;

module.exports = {
    STYLE_LOCK,
    VISUAL_STYLE_BLOCK,
    STYLE_AVOID,
    NEGATIVE_PROMPT
};
