const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { videosDir } = require('./tempDirs');
const { TARGET_WIDTH, TARGET_HEIGHT } = require('./imageFraming');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const POST_AUDIO_BUFFER_SECONDS = 0.25;
const AUDIO_FADE_DURATION = 0.03;
/** Match zoompan's default output rate (this FFmpeg build is from 2018). */
const VIDEO_FPS = 25;
/** Ken Burns zoom depth (10% — noticeable in/out per scene). */
const ZOOM_AMOUNT = 0.10;
const ZOOM_SOURCE_WIDTH = TARGET_WIDTH * 4;
const ZOOM_SOURCE_HEIGHT = TARGET_HEIGHT * 4;

/**
 * Ken Burns zoom for FFmpeg 2018: zoompan cannot take fps=, and scale cannot use t=.
 * Upscale first so each zoom step is a tiny fraction of a pixel, then trunc() the crop.
 */
function buildKenBurnsFilter(direction, durationSec) {
    const frames = Math.max(Math.round(durationSec * VIDEO_FPS), VIDEO_FPS);
    const last = Math.max(frames - 1, 1);
    const zoomExpr = direction === 'in'
        ? `1+${ZOOM_AMOUNT}*on/${last}`
        : `1+${ZOOM_AMOUNT}*(1-on/${last})`;

    return [
        `scale=${ZOOM_SOURCE_WIDTH}:${ZOOM_SOURCE_HEIGHT}`,
        `zoompan=z='${zoomExpr}':x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))':d=${frames}:s=${TARGET_WIDTH}x${TARGET_HEIGHT}`,
        'format=yuv420p',
    ];
}

/**
 * Merges a still image and audio into a scene clip with a slight zoom.
 * Even scenes (1, 3, …) zoom out; odd scenes (2, 4, …) zoom in.
 */
function createSceneVideo(imagePath, audioPath, sceneName, options = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const outputPath = path.join(videosDir(), `${safeSceneName}_${Date.now()}.mp4`);
            const sceneIndex = Number.isFinite(options.sceneIndex) ? options.sceneIndex : 0;
            const direction = sceneIndex % 2 === 0 ? 'out' : 'in';

            console.log(`Starting video generation for scene: ${sceneName} (zoom ${direction})`);

            let audioDurationSec = 0;
            try {
                audioDurationSec = await getAudioDurationInSeconds(audioPath);
                console.log(`Audio duration for ${sceneName}: ${audioDurationSec.toFixed(2)}s`);
            } catch (err) {
                console.warn(`Could not determine audio duration for ${sceneName} (logging only):`, err.message);
            }

            // Snap to a whole frame so the audio and video streams end on the exact same
            // timestamp. Fractional-frame clips leave a sub-frame gap that the concat
            // demuxer accumulates, drifting narration ahead of the images over a long video.
            const rawDuration = audioDurationSec + POST_AUDIO_BUFFER_SECONDS;
            const videoDurationSec = Math.round(rawDuration * VIDEO_FPS) / VIDEO_FPS;
            const fadeOutStart = Math.max(0, videoDurationSec - AUDIO_FADE_DURATION);
            // apad fills the trailing buffer with silence so the audio stream is exactly
            // as long as the video stream rather than ending early.
            const afilter = [
                `afade=t=in:st=0:d=${AUDIO_FADE_DURATION}`,
                `afade=t=out:st=${fadeOutStart}:d=${AUDIO_FADE_DURATION}`,
                'apad',
                'aresample=48000:async=1:first_pts=0',
            ].join(',');
            const vfilter = buildKenBurnsFilter(direction, videoDurationSec);

            ffmpeg()
                .input(imagePath)
                .input(audioPath)
                .videoFilters(vfilter)
                .outputOptions([
                    '-c:v libx264',
                    '-preset medium',
                    '-crf', '18',
                    '-c:a aac',
                    '-b:a 192k',
                    '-ar', '48000',
                    '-ac', '2',
                    '-af', afilter,
                    '-pix_fmt yuv420p',
                    '-r', String(VIDEO_FPS),
                    '-vsync', 'cfr',
                    '-t', videoDurationSec.toFixed(3),
                    '-avoid_negative_ts', 'make_zero',
                ])
                .save(outputPath)
                .on('end', () => {
                    console.log(`Successfully created scene video: ${outputPath}`);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error(`Error creating video for ${sceneName}:`, err.message);
                    reject(err);
                });
        } catch (error) {
            console.error(`Error preparing video creation for ${sceneName}:`, error.message);
            reject(error);
        }
    });
}

/**
 * Concatenates multiple mp4 videos into a single final.mp4 without re-encoding.
 * Requires all input videos to have the same codec, frame rate, and resolution.
 * 
 * @param {string[]} videoPaths - Array of absolute paths to the video files to be concatenated.
 * @param {string} [outputPath] - Optional absolute path for the final video.
 * @returns {Promise<string>} - Path to the combined final video.
 */
function concatenateVideos(videoPaths, outputPath) {
    return new Promise((resolve, reject) => {
        if (!videoPaths || videoPaths.length === 0) {
            return reject(new Error('No video paths provided for concatenation.'));
        }

        const dir = videosDir();
        const finalOutputPath = outputPath || path.join(dir, `final_${Date.now()}.mp4`);
        fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });

        const listFilePath = path.join(dir, `concat_list_${Date.now()}.txt`);

        // Write the list of files in the format required by FFmpeg concat demuxer
        const fileContent = videoPaths
            .map(vp => `file '${vp.replace(/\\/g, '/')}'`)
            .join('\n');

        fs.writeFileSync(listFilePath, fileContent);

        console.log(`Starting video concatenation for ${videoPaths.length} scenes...`);

        ffmpeg()
            .input(listFilePath)
            .inputOptions([
                '-f concat',
                '-safe 0',
                '-fflags', '+genpts',
            ])
            .outputOptions([
                '-c copy', // Stream copy, NO re-encoding
                '-avoid_negative_ts', 'make_zero',
                '-max_interleave_delta', '0',
            ])
            .save(finalOutputPath)
            .on('end', () => {
                console.log(`Successfully concatenated videos into: ${finalOutputPath}`);
                // Clean up the temporary list file
                try {
                    if (fs.existsSync(listFilePath)) {
                        fs.unlinkSync(listFilePath);
                    }
                } catch (e) {
                    console.error('Failed to clean up concat list file:', e);
                }
                resolve(finalOutputPath);
            })
            .on('error', (err) => {
                console.error('Error concatenating videos:', err.message);
                reject(err);
            });
    });
}

module.exports = {
    createSceneVideo,
    concatenateVideos,
    POST_AUDIO_BUFFER_SECONDS
};
