/**
 * Locked narrator character for every scene.
 * Minimalist stick figure — same design in every frame; only pose and expression change.
 */
const CHARACTER_NAME = 'Stickman';

const CHARACTER_SHORT = `simple stick figure: perfectly round white head, two solid black dot eyes, one curved line mouth, thin black stick arms and legs (single lines, no muscles, no hands with fingers), black waistcoat over white shirt, tiny black bow tie, black ink doodle style`;

const CHARACTER_LOCK = `LOCKED CHARACTER — ${CHARACTER_NAME} — ONLY draw this simple stick figure for every person in the scene. Perfectly round head (white fill, black outline). Two solid black oval/dot eyes. One simple curved line mouth. NO nose, NO ears, NO hair, NO beard, NO skin texture, NO realistic face, NO detailed cartoon face, NO vector human. Body is thin black stick lines only — stick arms, stick legs, no muscles, no realistic hands. Same outfit always: black waistcoat, white shirt, small black bow tie. If multiple people appear, every one is an identical copy of this stick figure. NEVER draw a detailed vector man, woman, or corporate infographic character.`;

const characterProfile = {
    name: CHARACTER_NAME,
    description: CHARACTER_LOCK,
    CHARACTER_NAME,
    CHARACTER_SHORT,
    CHARACTER_LOCK,
};

module.exports = characterProfile;
