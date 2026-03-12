// Backwards-compatible alias for image generation service.
// Exports generateAndSaveSceneImage from imageGeneration.service.js

const { generateAndSaveSceneImage } = require('./imageGeneration.service');

module.exports = {
    generateAndSaveSceneImage
};

