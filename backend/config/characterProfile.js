/**
 * Locked main explainer character. Injected into every scene prompt for consistency.
 * Text-to-image models must not render text; this describes only visual appearance.
 */
const characterProfile = {
    name: 'Jake',
    description: [
        'friendly explainer host',
        'male early 30s',
        'short brown hair',
        'light beard',
        'wearing dark sweater over white shirt',
        'modern cartoon explainer character'
    ].join(', ')
};

module.exports = characterProfile;
