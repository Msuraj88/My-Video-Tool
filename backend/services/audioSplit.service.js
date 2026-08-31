/**
 * Split one continuous narration MP3 into per-scene clips.
 *
 * The batch take keeps voice and pace identical across scenes, but it has to be cut
 * back apart accurately: a single boundary landing on the wrong pause shifts every
 * later scene, which is what makes images fall behind the narration midway through a
 * video. Boundaries are therefore chosen as a whole — the best strictly increasing
 * set of real pauses — rather than one nearest-pause guess at a time.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { audioDir } = require('../utils/tempDirs');

/** A cut may move this far from its estimated position to reach a real pause. */
const MAX_SNAP_SECONDS = 1.6;
/** Shortest clip we are willing to emit. */
const MIN_CLIP_SECONDS = 0.35;

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

function parseSilences(log) {
    const intervals = [];
    const re = /silence_start:\s*([0-9.]+)[\s\S]*?silence_end:\s*([0-9.]+)/g;
    let match;
    while ((match = re.exec(log))) {
        const start = parseFloat(match[1]);
        const end = parseFloat(match[2]);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            intervals.push({ start, end });
        }
    }
    return intervals;
}

/**
 * Detects pauses. Cutting at the middle of a pause splits the breath evenly between
 * the two clips, so neither scene starts with dead air or ends clipped.
 */
async function detectSilenceIntervals(filePath) {
    let log = '';
    try {
        log = await runFfmpeg([
            '-i', filePath,
            '-af', 'silencedetect=noise=-30dB:d=0.14',
            '-f', 'null',
            '-',
        ]);
    } catch (err) {
        log = String(err.log || err.stderr || '');
    }
    return parseSilences(log);
}

/**
 * Rough speaking time for a line. Devanagari characters map close to syllables, Latin
 * words need roughly three characters per syllable, and punctuation buys a pause.
 */
function speechWeight(text) {
    const t = String(text || '');
    const devanagari = (t.match(/[\u0900-\u097F]/g) || []).length;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    const digits = (t.match(/\d/g) || []).length;
    const pauses = (t.match(/[।,.!?;:]/g) || []).length;
    return Math.max(devanagari + latin * 0.62 + digits * 1.4 + pauses * 1.5, 1);
}

/**
 * Chooses one cut per boundary from the available pauses, strictly increasing and
 * minimising total displacement from the estimated positions. Boundaries with no
 * usable pause nearby keep their estimate, so an error stays local instead of
 * cascading into the rest of the timeline.
 *
 * @param {number[]} targets - Estimated boundary times, ascending.
 * @param {number[]} candidates - Candidate cut times, ascending.
 * @param {number} duration - Total audio duration.
 * @returns {number[]} Chosen boundary times.
 */
function chooseBoundaries(targets, candidates, duration) {
    const n = targets.length;
    if (!n) return [];

    const usable = candidates.filter((c) => c > MIN_CLIP_SECONDS && c < duration - MIN_CLIP_SECONDS);
    if (!usable.length) return targets.slice();

    // cost[i][j] = squared displacement of boundary i if cut at candidate j.
    const INF = Number.POSITIVE_INFINITY;
    const m = usable.length;
    const best = Array.from({ length: n }, () => new Array(m).fill(INF));
    const from = Array.from({ length: n }, () => new Array(m).fill(-1));

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
            const distance = Math.abs(usable[j] - targets[i]);
            if (distance > MAX_SNAP_SECONDS) continue;
            const own = distance * distance;
            if (i === 0) {
                best[i][j] = own;
                continue;
            }
            for (let k = 0; k < j; k++) {
                if (best[i - 1][k] === INF) continue;
                if (usable[j] - usable[k] < MIN_CLIP_SECONDS) continue;
                const total = best[i - 1][k] + own;
                if (total < best[i][j]) {
                    best[i][j] = total;
                    from[i][j] = k;
                }
            }
        }
    }

    let end = -1;
    let endCost = INF;
    for (let j = 0; j < m; j++) {
        if (best[n - 1][j] < endCost) {
            endCost = best[n - 1][j];
            end = j;
        }
    }
    if (end < 0) return targets.slice();

    const chosen = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        chosen[i] = usable[end];
        end = from[i][end];
        if (end < 0 && i > 0) {
            // No pause chain reached this far back; fall back to estimates for the rest.
            for (let k = i - 1; k >= 0; k--) chosen[k] = targets[k];
            break;
        }
    }
    return chosen;
}

/**
 * Cuts a batch narration file into one clip per scene.
 *
 * @param {string} inputPath - Path to the batch MP3.
 * @param {string[]} texts - Narration text per scene, in order.
 * @param {string} prefix - Filename prefix for the produced clips.
 * @returns {Promise<string[]>} Clip paths, one per scene, in order.
 */
async function splitAudioByTextWeights(inputPath, texts, prefix) {
    const duration = await getAudioDurationInSeconds(inputPath);
    const weights = texts.map((t) => speechWeight(t));
    const total = weights.reduce((a, b) => a + b, 0);

    const silences = await detectSilenceIntervals(inputPath);
    const candidates = silences.map((s) => (s.start + s.end) / 2).sort((a, b) => a - b);

    const targets = [];
    let acc = 0;
    for (let i = 0; i < weights.length - 1; i++) {
        acc += weights[i];
        targets.push((acc / total) * duration);
    }

    const boundaries = chooseBoundaries(targets, candidates, duration);
    const ends = [...boundaries, duration];

    for (let i = 0; i < ends.length; i++) {
        const previous = i === 0 ? 0 : ends[i - 1];
        if (ends[i] <= previous + MIN_CLIP_SECONDS) {
            ends[i] = Math.min(previous + MIN_CLIP_SECONDS, duration);
        }
    }

    const drift = boundaries.map((b, i) => Math.abs(b - targets[i]));
    const worst = drift.length ? Math.max(...drift) : 0;
    console.log(`[AUDIO SPLIT] ${texts.length} scenes over ${duration.toFixed(2)}s, worst boundary shift ${worst.toFixed(2)}s`);

    const dir = audioDir();
    const paths = [];
    let start = 0;
    for (let i = 0; i < ends.length; i++) {
        const end = ends[i];
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
    speechWeight,
    chooseBoundaries,
};
