/**
 * Global style guide for scene image prompts.
 * Targets: premium animated cartoon art style, rich scene environments, dynamic character.
 * Matches reference: professional animated explainer video quality (bitmoji/animated series look).
 */

/** Visual style block included in every prompt. */
const VISUAL_STYLE_BLOCK = `premium animated cartoon illustration
bold clean black outlines on all characters and objects
smooth flat colors with subtle shading and soft shadows
vibrant clean colors, rich and saturated, not dull or muted
high quality digital 2D cartoon art, animated series quality
fully detailed scene-appropriate background filling the entire frame edge to edge
character is part of the scene environment, not floating on a plain background
professional explainer video cartoon aesthetic, polished and engaging
dramatic scene composition, foreground character with rich background`;

/** Avoid these styles. */
const STYLE_AVOID = `Avoid:
photorealistic
3D render
realistic photo
kids cartoon
childish
blurred
cluttered
minimal icon only
empty plain background
plain white background
plain grey background`;

/**
 * Negative prompt (sent to image API).
 */
const NEGATIVE_PROMPT = `photorealistic
3D render
realistic photo
hyperrealistic
complex gradients
harsh shading
kids cartoon
childish
blurred
blurry
out of focus
low resolution
cluttered
corporate stock photo
minimal icon only
plain white background
plain grey background
empty background
solid color background only
different character
inconsistent style
basic flat vector
stock vector
clip art
text on image
words
letters
numbers on objects
illegible
distorted text
blurry text
watermark
logo
signature
brand
distorted face
deformed face
disfigured
bad anatomy
extra limbs
two people
duplicate character
multiple characters
multiple faces
central panel
bordered composition
patch
inset
letterbox
floating character with no environment
static pose
same pose every scene
rigid
lifeless
T-pose`;

module.exports = {
    VISUAL_STYLE_BLOCK,
    STYLE_AVOID,
    NEGATIVE_PROMPT
};
