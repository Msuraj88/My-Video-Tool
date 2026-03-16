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

const FILL_COLOR = '#C0E2FF';
const STROKE_COLOR = '#111C2D';
const STROKE_WIDTH = 6;

/** Normalize overlay text while keeping useful punctuation for highlighted phrases. */
function normalizeOverlayText(text) {
    if (text == null || typeof text !== 'string') return '';
    return text
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function stripPunctuationForNumberOverlay(text) {
    if (text == null || typeof text !== 'string') return '';
    return text
        .replace(/\.{2,}/g, ' ')
        .replace(/[.,;:!?'"\-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

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

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = fillStyle;
    ctx.fill();

    if (strokeStyle) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();
    }
}

function drawHighlightCards(ctx, highlights) {
    if (!Array.isArray(highlights) || highlights.length === 0) return;

    const cards = highlights.slice(0, 2);
    const positions = [
        { x: 90, y: 760, align: 'left' },
        { x: CANVAS_WIDTH - 90, y: 860, align: 'right' }
    ];

    cards.forEach((highlight, index) => {
        const text = normalizeOverlayText(highlight);
        if (!text) return;

        ctx.font = `700 42px ${TITLE_FONT_FAMILY}`;
        const maxCardWidth = 620;
        const paddingX = 28;
        const paddingY = 22;
        const lines = wrapText(ctx, text, maxCardWidth - paddingX * 2);
        const lineHeight = 50;
        const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
        const cardWidth = Math.min(maxCardWidth, Math.max(300, textWidth + paddingX * 2));
        const cardHeight = lines.length * lineHeight + paddingY * 2;
        const pos = positions[index] || positions[positions.length - 1];
        const x = pos.align === 'right' ? pos.x - cardWidth : pos.x;
        const y = pos.y;

        drawRoundedRect(ctx, x, y, cardWidth, cardHeight, 24, 'rgba(15, 28, 45, 0.84)', 'rgba(255,255,255,0.26)');

        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        lines.forEach((line, lineIndex) => {
            ctx.fillText(line, x + paddingX, y + paddingY + lineIndex * lineHeight + 18);
        });
    });
}

/**
 * Main overlay function
 */
async function overlaySceneText(imagePath, sceneData) {

    if (!imagePath || !fs.existsSync(imagePath)) {
        throw new Error('overlaySceneText: image path missing or file not found');
    }

    const headline = sceneData?.headline
        ? normalizeOverlayText(String(sceneData.headline))
        : '';
    const highlights = Array.isArray(sceneData?.highlights)
        ? sceneData.highlights.map((value) => normalizeOverlayText(value)).filter(Boolean)
        : [];
    const numbers = Array.isArray(sceneData?.numbers)
        ? sceneData.numbers.map(n => stripPunctuationForNumberOverlay(formatNumber(n))).filter(Boolean)
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

    drawHighlightCards(ctx, highlights);

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