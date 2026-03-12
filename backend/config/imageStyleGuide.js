/**
 * Global style guide for scene image prompts.
 * Modern YouTube finance explainer animation style — not flat corporate or stock illustration.
 */

/** Visual style block included in every prompt. */
const VISUAL_STYLE_BLOCK = `modern YouTube finance explainer style
cartoon infographic illustration
bold outlines
clean storytelling composition
simple supportive backgrounds
bright but soft colors
high contrast objects
large readable objects`;

/** Avoid these styles. */
const STYLE_AVOID = `Avoid:
flat corporate vector illustration
stock illustration style
isometric vector art
minimal icon scenes`;

/**
 * Negative prompt appended to all prompts (sent to image API).
 * Includes blur/softness terms to ensure sharp, professional output.
 */
const NEGATIVE_PROMPT = `flat vector illustration
corporate stock illustration
minimal icon illustration
abstract concept art
empty background
blurred
blurry
out of focus
soft focus
fuzzy
hazy
low resolution
unclear
low detail
motion blur`;

module.exports = {
    VISUAL_STYLE_BLOCK,
    STYLE_AVOID,
    NEGATIVE_PROMPT
};
