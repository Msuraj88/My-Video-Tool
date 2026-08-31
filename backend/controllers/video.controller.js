const { preprocessForNarration } = require('../services/scriptPreprocessor.service');
const { processScript } = require('../services/scriptSplitter.service');
const { buildScenePrompt } = require('../services/promptBuilder');
const { ensureVisualPlan } = require('../services/scenePromptGenerator');
const { generateAudio, generateConsistentSceneAudio, AUDIO_RENDER_VERSION } = require('../services/aiRouter');
const { generateImage } = require('../services/imageRouter');
const { createSceneVideo, concatenateVideos } = require('../utils/videoGenerator');
const { videosDir } = require('../utils/tempDirs');
const path = require('path');
const fs = require('fs');
const {
    formatSceneId,
    createProject,
    getProject,
    saveProject,
    copyIntoImages,
    copyIntoAudio,
    getVideoDir,
    getProjectDir,
} = require('../services/projectStore.service');

function publicScene(projectId, scene) {
    return {
        sceneId: scene.sceneId,
        sceneNumber: scene.sceneNumber,
        text: scene.text,
        imageUrl: scene.imageFile
            ? `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(scene.imageFile)}`
            : null,
        status: scene.imageFile ? 'ready' : 'placeholder',
        error: scene.error || null,
    };
}

function publicProject(project) {
    return {
        projectId: project.projectId,
        name: project.name,
        ttsProvider: project.ttsProvider,
        imageProvider: project.imageProvider,
        scenes: (project.scenes || []).map((s) => publicScene(project.projectId, s)),
        allImagesReady: (project.scenes || []).length > 0 &&
            (project.scenes || []).every((s) => !!s.imageFile),
        videoUrl: project.video?.fileName
            ? `/api/projects/${encodeURIComponent(project.projectId)}/video`
            : null,
        videoDownloadUrl: project.video?.fileName
            ? `/api/projects/${encodeURIComponent(project.projectId)}/video?download=1`
            : null,
    };
}

function splitIntoScenes(script) {
    const preprocessedScript = preprocessForNarration(script);
    const raw = processScript(preprocessedScript);
    return raw.map((scene, index) => ({
        sceneId: formatSceneId(index + 1),
        sceneNumber: index + 1,
        text: scene.text,
        imageFile: null,
        imagePath: null,
        prompt: null,
        error: null,
    }));
}

async function generateImageForScene(project, sceneIndex) {
    const scene = project.scenes[sceneIndex];
    const sceneName = `${project.projectId}_${scene.sceneId}`;
    const previousScenes = project.scenes
        .slice(0, sceneIndex)
        .map((s) => ({
            text: s.text,
            narration: s.sceneMemory?.narration,
            sceneVisual: s.sceneMemory?.sceneVisual,
            setting: s.sceneMemory?.setting,
        }))
        .filter((s) => s.text || s.sceneVisual);

    await ensureVisualPlan(project);

    const { prompt: imagePrompt, negativePrompt, sceneMemory } = await buildScenePrompt(scene.text, {
        sceneIndex,
        sceneId: scene.sceneId,
        visualPlan: project.visualPlan,
        previousScenes,
    });

    const tempImagePath = await generateImage(imagePrompt, project.imageProvider, sceneName, {
        negativePrompt,
    });

    const destPath = copyIntoImages(project.projectId, tempImagePath, scene.sceneId);

    scene.imageFile = `${scene.sceneId}.png`;
    scene.imagePath = destPath;
    scene.prompt = imagePrompt;
    scene.sceneMemory = sceneMemory;
    scene.error = null;
    return scene;
}

/**
 * Step 1: split script into editable scenes. Does not generate images or video.
 */
exports.splitScript = async (req, res) => {
    try {
        const { script, name, ttsProvider = 'elevenlabs', imageProvider = 'fal' } = req.body || {};
        if (!script || typeof script !== 'string' || !script.trim()) {
            return res.status(400).json({ error: 'A valid script string is required.' });
        }

        const scenes = splitIntoScenes(script.trim());
        if (!scenes.length) {
            return res.status(400).json({ error: 'The provided script resulted in zero scenes.' });
        }

        console.log('Understanding complete script before scene prompts...');
        const visualPlan = await ensureVisualPlan({ script: script.trim(), scenes, visualPlan: null });

        const project = createProject({
            name: name || 'Untitled Project',
            script: script.trim(),
            ttsProvider,
            imageProvider,
            scenes,
            visualPlan,
        });

        return res.status(201).json({
            message: 'Script split into scenes',
            ...publicProject(project),
        });
    } catch (error) {
        console.error('splitScript error:', error);
        return res.status(500).json({ error: 'Failed to split script', details: error.message });
    }
};

exports.getProject = async (req, res) => {
    try {
        const project = getProject(req.params.projectId);
        return res.status(200).json(publicProject(project));
    } catch (error) {
        const code = /not found/i.test(error.message) ? 404 : 500;
        return res.status(code).json({ error: error.message });
    }
};

/**
 * Save edited scene texts. Clears images for scenes whose text changed.
 */
exports.updateScenes = async (req, res) => {
    try {
        const project = getProject(req.params.projectId);
        const incoming = req.body?.scenes;
        if (!Array.isArray(incoming) || incoming.length === 0) {
            return res.status(400).json({ error: 'Body must include a non-empty scenes array.' });
        }

        const byId = new Map(incoming.map((s) => [s.sceneId, s]));
        project.scenes = project.scenes.map((scene) => {
            const edited = byId.get(scene.sceneId);
            if (!edited) return scene;
            const nextText = String(edited.text || '').trim();
            if (!nextText) return scene;
            if (nextText === scene.text) return scene;
            return {
                ...scene,
                text: nextText,
                imageFile: null,
                imagePath: null,
                audioPath: null,
                prompt: null,
                error: null,
            };
        });
        project.video = null;
        project.visualPlan = null;
        saveProject(project);
        return res.status(200).json(publicProject(project));
    } catch (error) {
        const code = /not found/i.test(error.message) ? 404 : 500;
        return res.status(code).json({ error: 'Failed to update scenes', details: error.message });
    }
};

/**
 * Generate one scene image.
 */
exports.generateSceneImage = async (req, res) => {
    try {
        const project = getProject(req.params.projectId);
        const sceneId = req.params.sceneId;
        const index = project.scenes.findIndex((s) => s.sceneId === sceneId);
        if (index < 0) {
            return res.status(404).json({ error: `Scene not found: ${sceneId}` });
        }

        await generateImageForScene(project, index);
        project.video = null;
        saveProject(project);
        return res.status(200).json(publicProject(project));
    } catch (error) {
        console.error('generateSceneImage error:', error);
        const code = /not found/i.test(error.message) ? 404 : 500;
        return res.status(code).json({ error: 'Failed to generate scene image', details: error.message });
    }
};

/**
 * Generate images for every scene that does not yet have one (or all if regenerateAll).
 */
exports.generateAllImages = async (req, res) => {
    try {
        const project = getProject(req.params.projectId);
        const regenerateAll = Boolean(req.body?.regenerateAll);

        await ensureVisualPlan(project);
        saveProject(project);

        const failures = [];
        for (let i = 0; i < project.scenes.length; i++) {
            if (!regenerateAll && project.scenes[i].imageFile) continue;
            const sceneId = project.scenes[i].sceneId;
            console.log(`Generating image ${i + 1}/${project.scenes.length} (${sceneId})`);
            try {
                await generateImageForScene(project, i);
                project.scenes[i].error = null;
            } catch (sceneErr) {
                console.error(`Image generation failed for ${sceneId}:`, sceneErr.message);
                project.scenes[i].error = sceneErr.message || 'Image generation failed';
                failures.push(sceneId);
            }
            saveProject(project);
        }

        project.video = null;
        saveProject(project);

        if (failures.length) {
            return res.status(207).json({
                ...publicProject(project),
                partialFailures: failures,
                message: `${failures.length} scene(s) failed to generate. Others are ready.`,
            });
        }
        return res.status(200).json(publicProject(project));
    } catch (error) {
        console.error('generateAllImages error:', error);
        const code = /not found/i.test(error.message) ? 404 : 500;
        return res.status(code).json({ error: 'Failed to generate scene images', details: error.message });
    }
};

/**
 * Assemble final video from existing scene images + TTS. Requires all images.
 */
exports.assembleVideo = async (req, res) => {
    try {
        const project = getProject(req.params.projectId);
        if (!project.scenes.length) {
            return res.status(400).json({ error: 'No scenes to render.' });
        }
        const missing = project.scenes.filter((s) => !s.imagePath || !fs.existsSync(s.imagePath));
        if (missing.length) {
            return res.status(400).json({
                error: 'Generate all scene images before creating the video.',
                missing: missing.map((s) => s.sceneId),
            });
        }

        const ttsProvider = req.body?.ttsProvider || project.ttsProvider || 'elevenlabs';
        const sceneVideoPaths = [];

        const needsFreshAudio = project.scenes.some(
            (scene) =>
                scene.audioRenderVersion !== AUDIO_RENDER_VERSION ||
                !scene.audioPath ||
                !fs.existsSync(scene.audioPath)
        );

        if (needsFreshAudio) {
            console.log(
                `Generating one continuous narration (${ttsProvider}, ${AUDIO_RENDER_VERSION}) so speaker and pace stay consistent...`
            );
            const batch = await generateConsistentSceneAudio(
                project.scenes,
                ttsProvider,
                project.projectId
            );
            if (batch.error) {
                return res.status(500).json({
                    error: 'Failed to generate narration audio',
                    details: batch,
                });
            }
            for (const clip of batch.clips) {
                const scene = project.scenes.find((s) => s.sceneId === clip.sceneId);
                if (!scene) continue;
                scene.audioPath = copyIntoAudio(project.projectId, clip.filePath, scene.sceneId);
                scene.audioDuration = clip.duration;
                scene.audioRenderVersion = AUDIO_RENDER_VERSION;
            }
            saveProject(project);
        } else {
            console.log('Reusing saved consistent narration clips');
        }

        for (let i = 0; i < project.scenes.length; i++) {
            const scene = project.scenes[i];
            const sceneName = `${project.projectId}_${scene.sceneId}`;
            const audioPath = scene.audioPath;

            if (!audioPath || !fs.existsSync(audioPath)) {
                return res.status(500).json({
                    error: `Missing audio for ${scene.sceneId} after narration render.`,
                });
            }

            const sceneVideoPath = await createSceneVideo(
                scene.imagePath,
                audioPath,
                sceneName,
                { sceneIndex: i }
            );
            sceneVideoPaths.push(sceneVideoPath);
        }

        const outputPath = path.join(getVideoDir(project.projectId), 'final.mp4');
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        await concatenateVideos(sceneVideoPaths, outputPath);

        project.video = {
            fileName: 'final.mp4',
            absolutePath: outputPath,
            renderedAt: new Date().toISOString(),
        };
        saveProject(project);

        return res.status(200).json({
            message: 'Video generated successfully',
            ...publicProject(project),
        });
    } catch (error) {
        console.error('assembleVideo error:', error);
        const code = /not found/i.test(error.message) ? 404 : 500;
        return res.status(code).json({ error: 'Failed to generate video', details: error.message });
    }
};

exports.serveImage = async (req, res) => {
    try {
        const project = getProject(req.params.projectId);
        const fileName = path.basename(String(req.params.fileName || ''));
        const scene = project.scenes.find((s) => s.imageFile === fileName);
        const filePath = scene?.imagePath || path.join(getProjectDir(project.projectId), 'images', fileName);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Image not found' });
        }
        return res.sendFile(filePath);
    } catch (error) {
        const code = /not found/i.test(error.message) ? 404 : 500;
        return res.status(code).json({ error: error.message });
    }
};

exports.serveVideo = async (req, res) => {
    try {
        const project = getProject(req.params.projectId);
        const filePath = project.video?.absolutePath;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Video not found. Generate the video first.' });
        }
        if (String(req.query.download || '') === '1') {
            return res.download(filePath, `${project.projectId}.mp4`);
        }
        return res.sendFile(filePath);
    } catch (error) {
        const code = /not found/i.test(error.message) ? 404 : 500;
        return res.status(code).json({ error: error.message });
    }
};

/**
 * Legacy one-shot pipeline (kept for compatibility).
 */
exports.generateVideo = async (req, res) => {
    try {
        const { script, ttsProvider = 'elevenlabs', imageProvider = 'fal' } = req.body;

        if (!script || typeof script !== 'string') {
            return res.status(400).json({ error: 'A valid script string is required in the request body.' });
        }

        console.log('TTS Provider:', ttsProvider);
        console.log('Image Provider:', imageProvider);
        console.log(`--- STARTING VIDEO GENERATION PIPELINE (TTS: ${ttsProvider}, Image: ${imageProvider}) ---`);

        // Step 1: Preprocess script for pacing, then split into scenes
        console.log('Step 1: Preprocessing script for narration pacing...');
        const preprocessedScript = preprocessForNarration(script);
        console.log('Step 2: Splitting script into scenes (10–15 words)...');
        const scenes = processScript(preprocessedScript);

        if (scenes.length === 0) {
            return res.status(400).json({ error: 'The provided script resulted in zero scenes.' });
        }

        console.log(`Script split into ${scenes.length} scenes.`);

        const stagedScenes = scenes.map((scene, index) => ({
            sceneId: formatSceneId(index + 1),
            text: scene.text,
        }));
        const visualPlan = await ensureVisualPlan({
            script: preprocessedScript,
            scenes: stagedScenes,
            visualPlan: null,
        });

        const sceneVideoPaths = [];
        const previousScenes = [];

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const sceneName = `scene_${scene.scene_number}`;

            console.log(`\n--- Processing Scene ${scene.scene_number}/${scenes.length} ---`);

            const { prompt: imagePrompt, negativePrompt, sceneMemory } = await buildScenePrompt(scene.text, {
                sceneIndex: i,
                sceneId: stagedScenes[i].sceneId,
                visualPlan,
                previousScenes: [...previousScenes],
            });
            previousScenes.push(sceneMemory);

            console.log('FINAL PROMPT:', imagePrompt);

            // Generate Audio (via router: no fallback)
            const audioResult = await generateAudio(scene.text, ttsProvider, sceneName);
            if (audioResult.error) {
                console.error(`Pipeline aborting: Audio generation failed for ${sceneName}`, audioResult.details);
                return res.status(500).json({
                    error: `Failed to generate audio for scene ${scene.scene_number}`,
                    details: audioResult
                });
            }
            const audioPath = audioResult.filePath;

            // Generate Image (via router: no fallback)
            const imagePath = await generateImage(imagePrompt, imageProvider, sceneName, { negativePrompt });

            const sceneVideoPath = await createSceneVideo(imagePath, audioPath, sceneName, { sceneIndex: i });
            sceneVideoPaths.push(sceneVideoPath);

            console.log(`Completed ${sceneName}`);
        }

        // Step 3: Concatenate all scene videos
        console.log('\n--- Finalizing Video ---');
        console.log('Step 3: Concatenating all scenes into master video...');

        const outputFilename = `final_video_${Date.now()}.mp4`;
        const outputPath = path.join(videosDir(), outputFilename);

        const finalVideoPath = await concatenateVideos(sceneVideoPaths, outputPath);

        console.log('--- PIPELINE COMPLETE ---');
        console.log(`Final video ready at: ${finalVideoPath}`);

        // Return success response
        // In a real production app, you might upload this to S3 and return the public URL instead of a local path.
        return res.status(200).json({
            message: 'Video generated successfully',
            scenes_processed: scenes.length,
            final_video_path: finalVideoPath
        });

    } catch (error) {
        console.error('Pipeline Error:', error);

        return res.status(500).json({
            error: 'An error occurred during video generation.',
            details: error.message
        });
    }
};
