const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');
const { getAudioDurationInSeconds } = require('get-audio-duration');

// Set the path to the ffmpeg binary provided by @ffmpeg-installer
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Ensure temp video directory exists
const tempVideoDir = path.join(__dirname, '../temp/videos');
if (!fs.existsSync(tempVideoDir)) {
    fs.mkdirSync(tempVideoDir, { recursive: true });
}

// Cinematic timing: buffer (seconds) after audio ends before video ends
const POST_AUDIO_BUFFER_SECONDS = 0.6;

/**
 * Merges a single image and an audio file into a video.
 * Video duration = audio duration + POST_AUDIO_BUFFER_SECONDS for cinematic hold.
 *
 * @param {string} imagePath - Absolute path to the PNG/JPG image file.
 * @param {string} audioPath - Absolute path to the MP3/WAV audio file.
 * @param {string} sceneName - Unique identifier for the scene.
 * @returns {Promise<string>} - A promise that resolves to the path of the generated video.
 */
function createSceneVideo(imagePath, audioPath, sceneName) {
    return new Promise(async (resolve, reject) => {
        try {
            const safeSceneName = sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const outputPath = path.join(tempVideoDir, `${safeSceneName}_${Date.now()}.mp4`);

            console.log(`Starting video generation for scene: ${sceneName}`);

            let audioDurationSec = 0;
            try {
                audioDurationSec = await getAudioDurationInSeconds(audioPath);
                console.log(`Audio duration for ${sceneName}: ${audioDurationSec.toFixed(2)}s`);
            } catch (err) {
                console.warn(`Could not determine audio duration for ${sceneName} (logging only):`, err.message);
            }

            const videoDurationSec = audioDurationSec + POST_AUDIO_BUFFER_SECONDS;

            // Build video: duration = audio + buffer (image holds for 0.6s after audio ends)
            ffmpeg()
                // Input 1: The still image
                .input(imagePath)
                .inputOptions(['-loop 1']) // Loop still image

                // Input 2: The audio track
                .input(audioPath)

                // Output options: explicit duration for cinematic buffer
                .outputOptions([
                    '-c:v libx264',       // Use H.264 video codec
                    '-tune stillimage',   // Optimize for still image
                    '-c:a aac',           // Use AAC audio codec
                    '-b:a 192k',          // Audio bitrate
                    '-pix_fmt yuv420p',   // Pixel format for compatibility
                    '-t', String(videoDurationSec)  // Video length = audio + 0.6s buffer
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

        const finalOutputPath = outputPath || path.join(tempVideoDir, `final_${Date.now()}.mp4`);

        // Ensure temp directory exists for the list file
        const listFilePath = path.join(tempVideoDir, `concat_list_${Date.now()}.txt`);

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
                '-safe 0'
            ])
            .outputOptions([
                '-c copy' // Stream copy, NO re-encoding
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
