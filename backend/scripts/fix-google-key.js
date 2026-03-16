/**
 * Fixes service account JSON: replaces literal \n in private_key with real newlines.
 * Run from project root: node backend/scripts/fix-google-key.js
 * Then set GOOGLE_APPLICATION_CREDENTIALS to the output path (or use gcloud with it).
 */

const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..');
const defaultKey = path.join(backendDir, 'gen-lang-client-0244825199-8b3f8c52a02a.json');
const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const inputPath = envPath && fs.existsSync(envPath)
    ? (path.isAbsolute(envPath) ? envPath : path.join(backendDir, envPath))
    : (fs.existsSync(defaultKey) ? defaultKey : null);

if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('No key file found. Set GOOGLE_APPLICATION_CREDENTIALS or place gen-lang-client-*.json in backend/');
    process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const creds = JSON.parse(raw);
if (creds.private_key && typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
}

const base = path.basename(inputPath, path.extname(inputPath));
const outPath = path.join(backendDir, base + '-FIXED.json');
fs.writeFileSync(outPath, JSON.stringify(creds, null, 2), 'utf8');

console.log('Fixed key written to:', outPath);
console.log('Next: set GOOGLE_APPLICATION_CREDENTIALS to this file, or run:');
console.log('  gcloud auth activate-service-account --key-file="' + outPath + '"');
