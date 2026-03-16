/**
 * Google Cloud authentication using the official google-auth-library.
 * Service account only; no API key. The library reads the key file via keyFilename.
 */

const path = require('path');
const { GoogleAuth } = require('google-auth-library');

function getKeyPath() {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return credentialsPath || null;
}

async function getGoogleAccessToken() {
    let credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!credentialsPath) {
        throw new Error(
            'GOOGLE_APPLICATION_CREDENTIALS environment variable is missing.'
        );
    }

    if (!path.isAbsolute(credentialsPath)) {
        credentialsPath = path.resolve(__dirname, '..', credentialsPath);
    }

    const auth = new GoogleAuth({
        keyFilename: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    return token.token;
}

module.exports = { getKeyPath, getGoogleAccessToken };
