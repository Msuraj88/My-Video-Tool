/**
 * Split one continuous narration MP3 into per-scene clips.
 * Prefers silence near character-count timestamps so we do not cut mid-word.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { audioDir } = require('../utils/tempDirs');

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        execFile(ffmpegPath, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
            const log = `${stdout || ''}\n${stderr || ''}`;
            if (err) {
                err.log = log;
                reject(err);
                return;
            }
            resolve(log);
        });
    });
}

async function detectSilenceStarts(filePath) {
    try {
        const log = await runFfmpeg([
            '-i', filePath,
            '-af', 'silencedetect=noise=-28dB:d=0.16',
            '-f', 'null',
            '-',
        ]);
        const starts = [];
        const re = /silence_start:\s*([0-9.]+)/g;
        let match;
        while ((match = re.exec(log))) {
            starts.push(parseFloat(match[1]));
        }
        return starts;
    } catch (err) {
        const log = String(err.log || err.stderr || '');
        const starts = [];
        const re = /silence_start:\s*([0-9.]+)/g;
        let match;
        while ((match = re.exec(log))) {
            starts.push(parseFloat(match[1]));
        }
        return starts;
    }
}

function speechWeight(text) {
    const t = String(text || '');
    const latin = (t.match(/[A-Za-z0-9]+/g) || []).join('').length;
    const rest = Math.max(t.length - latin, 0);
    return Math.max(rest + latin * 1.65, 1);
}

function snapToSilence(target, silences, duration) {
    if (!silences.length) return Math.min(Math.max(target, 0.05), duration);
    let best = target;
    let bestDist = Infinity;
    for (const t of silences) {
        if (t < 0.12 || t > duration - 0.12) continue;
        const dist = Math.abs(t - target);
        if (dist < bestDist && dist <= 0.55) {
            best = t;
            bestDist = dist;
        }
    }
    return Math.min(Math.max(best, 0.05), duration);
}

async function splitAudioByTextWeights(inputPath, texts, prefix) {
    const duration = await getAudioDurationInSeconds(inputPath);
    const weights = texts.map((t) => speechWeight(t));
    const total = weights.reduce((a, b) => a + b, 0);
    const silences = await detectSilenceStarts(inputPath);

    const ends = [];
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
        acc += weights[i];
        if (i === weights.length - 1) {
            ends.push(duration);
        } else {
            ends.push(snapToSilence((acc / total) * duration, silences, duration));
        }
    }

    const dir = audioDir();
    const paths = [];
    let start = 0;
    for (let i = 0; i < ends.length; i++) {
        let end = ends[i];
        if (end <= start + 0.12) end = Math.min(start + 0.25, duration);
        const outPath = path.join(dir, `${prefix}_part_${i + 1}_${Date.now()}.mp3`);
        await runFfmpeg([
            '-y',
            '-i', inputPath,
            '-ss', start.toFixed(3),
            '-to', end.toFixed(3),
            '-c:a', 'libmp3lame',
            '-q:a', '4',
            outPath,
        ]);
        if (!fs.existsSync(outPath)) {
            throw new Error(`Failed to write audio split ${outPath}`);
        }
        paths.push(outPath);
        start = end;
    }
    return paths;
}

module.exports = {
    splitAudioByTextWeights,
};
