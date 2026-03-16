const sharp = require('sharp');

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

/**
 * Outputs exactly 1920x1080 for video. Fills the full frame (no patch/letterboxing).
 * - If the image is already 16:9, resizes to exact 1920x1080.
 * - If the image is square or other ratio, uses "cover" so the frame is filled
 *   (cropping to 16:9) so the scene never appears as a small patch in the center.
 *
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
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
