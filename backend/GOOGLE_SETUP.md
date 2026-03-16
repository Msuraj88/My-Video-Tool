# Google Cloud setup (TTS + Imagen)

## Option A: API key (easiest for TTS)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **API key** (or use an existing one).
2. Enable **Cloud Text-to-Speech API** for your project: [texttospeech.googleapis.com](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com).
3. In your project, set in `.env` (or environment):
   ```env
   GOOGLE_API_KEY=your_api_key_here
   GOOGLE_CLOUD_PROJECT_ID=your-project-id
   ```
4. Restart the backend. Google TTS will use the API key; no service account file needed.

---

## Option B: Service account key (for TTS + Imagen)

1. Create a service account and download its JSON key. Place it in `backend/` (e.g. `gen-lang-client-0244825199-8b3f8c52a02a.json`) or set `GOOGLE_APPLICATION_CREDENTIALS` to its path.
2. Set `GOOGLE_CLOUD_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`) in your environment.
3. **Important:** The JSON key must use `\n` for newlines in `private_key`. If you see "Invalid PEM" errors:
   - Re-download the key from Cloud Console, or
   - Run: `node backend/scripts/fix-google-key.js` and point `GOOGLE_APPLICATION_CREDENTIALS` to the `-FIXED.json` file.
4. Grant the service account roles: **Cloud Text-to-Speech User**, and **Vertex AI User** if you use Imagen.

---

## If service account fails

- Set **GOOGLE_API_KEY** in `.env`. The app will use the API key when the service account fails (e.g. PEM issues on Windows).
- No gcloud install required for either option.

---

## APIs to enable

- **TTS**: [Cloud Text-to-Speech API](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com)
- **Imagen**: [Vertex AI API](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com); set `GOOGLE_CLOUD_LOCATION` (default `us-central1`).
