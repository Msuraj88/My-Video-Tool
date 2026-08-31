/**
 * Standalone smoke test for Gemini 2.5 Flash Image via the existing Google image service.
 * Run from repo root: node backend/test-google-image-generation.js
 * Or from backend:     node test-google-image-generation.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { generateAndSaveSceneImageGoogle } = require('./services/googleImage.service');

(async () => {
    const dest = path.join(__dirname, 'test-google-image.png');
    const prompt = 'A cinematic modern living room with a young Indian man sitting comfortably in a chair, thoughtful expression, warm natural lighting, contemporary interior, documentary-style visual, professional composition, 16:9.';
    try {
        const generatedPath = await generateAndSaveSceneImageGoogle(prompt, 'test_google_image');
        fs.copyFileSync(generatedPath, dest);
        console.log(`[GOOGLE IMAGE TEST] Copied to ${dest}`);
        process.exit(0);
    } catch (err) {
        console.error('[GOOGLE IMAGE TEST] Failed:', err.message);
        process.exit(1);
    }
})();
