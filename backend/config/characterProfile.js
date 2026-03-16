/**
 * Narrator character visual description for prompt-based generation.
 * Purely text-based — no reference image file.
 * Matches the uploaded cartoon-style male instructor character.
 */
const characterProfile = {
    name: 'Narrator',
    description: [
        'male cartoon instructor character, animated cartoon art style similar to bitmoji or animated series',
        'slightly large expressive cartoon head proportions, smooth rounded face',
        'short neat dark brown hair swept upward slightly at the front',
        'light fair skin, dark bold eyebrows, warm brown eyes, clean cartoon face',
        'short neatly trimmed dark stubble beard',
        'bold clean black outlines on the character body and face',
        'dark charcoal or navy crew-neck sweater over white collared shirt, white collar and cuffs visible',
        'dark charcoal slim trousers, dark brown oxford shoes',
        'smooth flat cartoon shading with subtle highlights, same design every scene'
    ].join(', ')
};

module.exports = characterProfile;
