const fs = require('fs');
const path = require('path');

/**
 * Loads the active character profile from configuration.
 * @returns {Object|null} The character profile object or null if it fails to load.
 */
function getCharacterProfile() {
    try {
        const profilePath = path.join(__dirname, '../config/characterProfile.json');
        const rawData = fs.readFileSync(profilePath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error('Error loading character profile:', error.message);
        return null;
    }
}

/**
 * Injects the character profile description and style into the given scene prompt.
 * This ensures the Image Generation API maintains a consistent character.
 * 
 * @param {string} scenePrompt - The specific scene or action for the character (e.g., "pointing at a whiteboard explaining SEO")
 * @returns {Object} An object containing the enhanced prompt and optional image reference for APIs supporting it.
 */
function buildImagePrompt(scenePrompt) {
    const profile = getCharacterProfile();

    if (!profile) {
        console.warn('Character profile not found. Using original prompt.');
        return {
            prompt: scenePrompt,
            reference_image: null
        };
    }

    // Construct the enhanced prompt by prepending style and character physical description
    const enhancedPrompt = `Style: ${profile.style}. Character: ${profile.description}. Scene/Action: ${scenePrompt}. Verify the character appearance perfectly matches the description in this scene.`;

    return {
        prompt: enhancedPrompt,
        // Provided for APIs like Midjourney (--cref) or Stable Diffusion ControlNet where you pass a reference image
        reference_image: profile.image_reference_url || null,
        profile_id: profile.id
    };
}

module.exports = {
    getCharacterProfile,
    buildImagePrompt
};
