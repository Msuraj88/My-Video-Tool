const fs = require('fs');
const path = require('path');

const DEFAULT_REFERENCE_CANDIDATES = [
    process.env.CHARACTER_REFERENCE_IMAGE,
    path.join(__dirname, '../assets/stickman-reference.png'),
    path.join(__dirname, '../assets/character-reference.png'),
    path.join(__dirname, '../assets/character.png'),
    path.join(__dirname, '../character-reference.png'),
    path.join(__dirname, '../character.png'),
    'C:\\Users\\Suraj\\.cursor\\projects\\d-Learning-new-node-video-tool\\assets\\c__Users_Suraj_AppData_Roaming_Cursor_User_workspaceStorage_ac4d7747f18a168a7dd65bfc0fcbd019_images_character-2a2fe5a9-b942-4084-8d19-c7fcfa262447.png'
].filter(Boolean);

function normalizePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') return null;
    const trimmed = inputPath.trim();
    if (!trimmed) return null;
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(__dirname, '..', trimmed);
}

function parseReferencePaths() {
    const multi = process.env.CHARACTER_REFERENCE_IMAGES || '';
    const fromEnv = multi
        .split(/[;,]/)
        .map(normalizePath)
        .filter(Boolean);

    const candidates = [...fromEnv, ...DEFAULT_REFERENCE_CANDIDATES.map(normalizePath).filter(Boolean)];
    const seen = new Set();

    return candidates.filter((candidate) => {
        const key = candidate.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return fs.existsSync(candidate);
    }).slice(0, 4);
}

function getCharacterReferenceImages() {
    const referencePaths = parseReferencePaths();

    return referencePaths.map((imagePath) => ({
        path: imagePath,
        bytesBase64Encoded: fs.readFileSync(imagePath).toString('base64')
    }));
}

module.exports = {
    getCharacterReferenceImages
};
