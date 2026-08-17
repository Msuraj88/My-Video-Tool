/**
 * File-based project store for the staged script-to-video workflow.
 */

const fs = require('fs');
const path = require('path');

const PROJECTS_ROOT = path.join(__dirname, '../projects');

function ensureRoot() {
    if (!fs.existsSync(PROJECTS_ROOT)) {
        fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
    }
}

function sanitizeId(value) {
    return String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function formatSceneId(n) {
    return `scene-${String(n).padStart(3, '0')}`;
}

function getProjectDir(projectId) {
    const id = sanitizeId(projectId);
    if (!id) throw new Error('A valid project id is required.');
    return path.join(PROJECTS_ROOT, id);
}

function projectPath(projectId) {
    return path.join(getProjectDir(projectId), 'project.json');
}

function readJson(filePath, fallback = null) {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function createProject({ name, script, ttsProvider, imageProvider, scenes, visualPlan }) {
    ensureRoot();
    const projectId = `proj-${Date.now()}`;
    const projectDir = getProjectDir(projectId);
    fs.mkdirSync(path.join(projectDir, 'images'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'audio'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'video'), { recursive: true });

    const now = new Date().toISOString();
    const project = {
        projectId,
        name: name || 'Untitled Project',
        script: script || '',
        ttsProvider: ttsProvider || 'elevenlabs',
        imageProvider: imageProvider || 'fal',
        scenes,
        visualPlan: visualPlan || null,
        video: null,
        createdAt: now,
        updatedAt: now,
    };
    writeJson(projectPath(projectId), project);
    return project;
}

function getProject(projectId) {
    const file = projectPath(projectId);
    if (!fs.existsSync(file)) {
        throw new Error(`Project not found: ${projectId}`);
    }
    return readJson(file);
}

function saveProject(project) {
    project.updatedAt = new Date().toISOString();
    writeJson(projectPath(project.projectId), project);
    return project;
}

function getImagesDir(projectId) {
    const dir = path.join(getProjectDir(projectId), 'images');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getVideoDir(projectId) {
    const dir = path.join(getProjectDir(projectId), 'video');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getAudioDir(projectId) {
    const dir = path.join(getProjectDir(projectId), 'audio');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function copyIntoImages(projectId, sourcePath, sceneId) {
    const dest = path.join(getImagesDir(projectId), `${sceneId}.png`);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.copyFileSync(sourcePath, dest);
    try {
        fs.unlinkSync(sourcePath);
    } catch (_) {
        /* ignore temp cleanup */
    }
    return dest;
}

function copyIntoAudio(projectId, sourcePath, sceneId) {
    const ext = path.extname(sourcePath) || '.mp3';
    const dest = path.join(getAudioDir(projectId), `${sceneId}${ext}`);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.copyFileSync(sourcePath, dest);
    return dest;
}

module.exports = {
    PROJECTS_ROOT,
    formatSceneId,
    sanitizeId,
    getProjectDir,
    createProject,
    getProject,
    saveProject,
    getImagesDir,
    getVideoDir,
    getAudioDir,
    copyIntoImages,
    copyIntoAudio,
};
