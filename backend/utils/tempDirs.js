/**
 * Temp output dirs (images, audio, videos). Recreated on every write so
 * deleting backend/temp while the server is running does not cause ENOENT.
 */
const fs = require('fs');
const path = require('path');

const TEMP_ROOT = path.join(__dirname, '../temp');

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
}

function imagesDir() {
    return ensureDir(path.join(TEMP_ROOT, 'images'));
}

function audioDir() {
    return ensureDir(path.join(TEMP_ROOT, 'audio'));
}

function videosDir() {
    return ensureDir(path.join(TEMP_ROOT, 'videos'));
}

function ensureAllTempDirs() {
    imagesDir();
    audioDir();
    videosDir();
}

module.exports = {
    TEMP_ROOT,
    ensureDir,
    imagesDir,
    audioDir,
    videosDir,
    ensureAllTempDirs,
};
