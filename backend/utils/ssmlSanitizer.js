/**
 * Removes SSML tags that Google Studio voices do not support.
 * Use before sending SSML to Google TTS when using Studio voices.
 */

function sanitizeSSML(text) {
    if (!text || typeof text !== 'string') return '';

    return text
        .replace(/<emphasis[^>]*>/g, '')
        .replace(/<\/emphasis>/g, '')
        .replace(/<audio[^>]*>/g, '')
        .replace(/<\/audio>/g, '')
        .replace(/<say-as[^>]*>/g, '')
        .replace(/<\/say-as>/g, '')
        .replace(/<break time="0s"\/>/g, '');
}

module.exports = { sanitizeSSML };
