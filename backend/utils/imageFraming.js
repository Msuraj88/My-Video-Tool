const sharp = require('sharp');

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;

/**
 * Outputs exactly 1280x720 (HD 16:9) for video.
 */
async function frameImageForVideo(buffer) {
    return sharp(buffer)
        .resize(TARGET_WIDTH, TARGET_HEIGHT, {
            fit: 'cover',
            position: 'center',
            kernel: sharp.kernel.lanczos3
        })
        .modulate({ brightness: 1.01, saturation: 1.03 })
        .sharpen({ sigma: 1.0, m1: 1.0, m2: 0.5 })
        .png()
        .toBuffer();
}

module.exports = {
    frameImageForVideo,
    TARGET_WIDTH,
    TARGET_HEIGHT
};
