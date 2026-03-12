/**
 * Renders text overlays on scene images after generation using Canvas.
 * Text-to-image models cannot render text reliably; numbers and headlines are added here.
 * Output is always 1920x1080 PNG with strong, high-contrast explainer-style text.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { formatNumber } = require('../utils/formatNumber');

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

const TITLE_FONT_SIZE = 60;
const NUMBER_FONT_SIZE = 120;
const SUBTEXT_FONT_SIZE = 40;

const PADDING_X = 100;
const MAX_TEXT_WIDTH = CANVAS_WIDTH - 200;

const TITLE_FONT_FAMILY = "'Montserrat','Poppins','Arial',sans-serif";
const NUMBER_FONT_FAMILY = "'Montserrat','Poppins','Arial',sans-serif";

const FILL_COLOR = '#ffffff';
const STROKE_COLOR = '#000000';
const STROKE_WIDTH = 6;

/**
 * Splits text into lines so that each line fits within maxWidth.
 */
function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
}

/**
 * Draws text with stroke + fill + shadow
 */
function drawTextLine(ctx, text, x, y) {
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    ctx.lineWidth = STROKE_WIDTH;
    ctx.strokeStyle = STROKE_COLOR;
    ctx.fillStyle = FILL_COLOR;

    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

/**
 * Main overlay function
 */
async function overlaySceneText(imagePath, sceneData) {

    if (!imagePath || !fs.existsSync(imagePath)) {
        throw new Error('overlaySceneText: image path missing or file not found');
    }

    const headline = sceneData?.headline ? String(sceneData.headline).trim() : '';
    const numbers = Array.isArray(sceneData?.numbers)
        ? sceneData.numbers.map(n => formatNumber(n)).filter(Boolean)
        : [];

    const dir = path.dirname(imagePath);
    const ext = path.extname(imagePath) || '.png';
    const base = path.basename(imagePath, ext);

    const outputPath = path.join(dir, `${base}_overlay${ext}`);

    const baseImage = await loadImage(imagePath);

    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Draw background image
    ctx.drawImage(baseImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    let currentY = 90;

    /*
    -----------------------------
    TITLE TEXT
    -----------------------------
    */

    if (headline) {

        ctx.font = `600 ${TITLE_FONT_SIZE}px ${TITLE_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lines = wrapText(ctx, headline, MAX_TEXT_WIDTH);
        const lineHeight = TITLE_FONT_SIZE * 1.2;

        const centerX = CANVAS_WIDTH / 2;

        lines.forEach((line) => {
            drawTextLine(ctx, line, centerX, currentY);
            currentY += lineHeight;
        });

        currentY += 30;
    }

    /*
    -----------------------------
    NUMBERS (BIG STATS)
    -----------------------------
    */

    if (numbers.length > 0) {

        ctx.font = `700 ${NUMBER_FONT_SIZE}px ${NUMBER_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const centerX = CANVAS_WIDTH / 2;
        const lineHeight = NUMBER_FONT_SIZE * 1.1;

        numbers.forEach((num) => {
            drawTextLine(ctx, num, centerX, currentY);
            currentY += lineHeight;
        });
    }

    /*
    -----------------------------
    SAVE FINAL IMAGE
    -----------------------------
    */

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
}

module.exports = {
    overlaySceneText
};