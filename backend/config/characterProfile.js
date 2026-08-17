/**
 * Locked narrator character for every scene.
 * Appearance is fixed — scene prompts may only change pose, expression, and setting.
 * Matches the 2D outline reference: young man, spiky black hair, navy crew-neck sweater.
 */
const CHARACTER_NAME = 'Arjun';

const CHARACTER_LOCK = `LOCKED CHARACTER — ${CHARACTER_NAME} — identical in every scene, do not redesign. Young adult man, pale skin, short messy spiky jet-black hair, large oval eyes with heavy upper lids and simple black pupils, small simple nose, thin mouth, clean-shaven, no beard, no stubble, no glasses, slightly large rounded head, simple webtoon facial features. Wearing a plain solid dark navy-blue crew-neck sweater, no collar, no shirt underneath, no logos. Simple casual proportions, bold uniform black outlines on face, hair, and clothes. He is the ONLY person in the frame — never a second person, never a duplicate, never a different haircut or outfit.`;

const characterProfile = {
    name: CHARACTER_NAME,
    description: CHARACTER_LOCK,
    CHARACTER_NAME,
    CHARACTER_LOCK,
};

module.exports = characterProfile;
