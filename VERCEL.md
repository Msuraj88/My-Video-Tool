# Vercel Deployment Plan

This document describes how to deploy the AI Video Generator and its limitations on Vercel.

---

## 1. Application Overview

- **Backend:** Node.js + Express in `backend/`
- **Frontend:** Static HTML/JS in `frontend/`
- **Main flow:** Script → scenes → TTS (Google/ElevenLabs) + images (Fal/Google) → overlay → FFmpeg → final video
- **Storage:** Writes to `backend/temp/` (audio, images, videos) and returns a local file path

---

## 2. Vercel Limitations (Important)

| Concern | Vercel behavior | Impact |
|--------|------------------|--------|
| **Execution timeout** | 10s (Hobby) / 60s (Pro) per serverless function | Full video generation can take **minutes** → timeouts |
| **Ephemeral filesystem** | Only `/tmp` (limited size, cleared between invocations) | Temp audio/images/videos must use `/tmp` and may run out of space for long videos |
| **FFmpeg** | Not installed by default | Need to use a layer, binary, or external service |
| **No long-running process** | Each request = new function instance | No persistent server; cold starts and no in-memory state |

**Recommendation:** For **full video generation**, run the backend on a platform that supports long-running processes and persistent disk (e.g. **Railway**, **Render**, **Fly.io**). Use Vercel for the **frontend only**, or for **non–video API routes** (e.g. health, hello).

---

## 3. Deployment Options

### Option A — Frontend on Vercel + Backend Elsewhere (Recommended)

- Deploy **frontend** to Vercel (static site).
- Deploy **backend** to Railway / Render / Fly.io and set `VITE_API_URL` or equivalent so the frontend calls that URL.
- No timeout or FFmpeg issues on Vercel; backend handles heavy work.

### Option B — Full Stack on Vercel (Experimental)

- Build the Express app as **serverless functions** (e.g. `api/*.js`).
- Accept that **video generation will likely timeout** unless you split work (e.g. queue + polling or external worker).
- Use `/tmp` for all temp files and ensure FFmpeg is available (e.g. via layer or bundled binary).

---

## 4. Option A: Deploy Frontend to Vercel

### 4.1 Project layout for Vercel

Place the frontend where Vercel can serve it as a static site, e.g.:

- **Option 1:** Root = repo root; set “Output Directory” to `frontend` and “Build Command” to none (or a simple copy).
- **Option 2:** Move/copy `frontend/` contents to a `public/` folder and set “Output Directory” to `public`.

### 4.2 Steps

1. **Install Vercel CLI (optional):**
   ```bash
   npm i -g vercel
   ```

2. **From the project root, link and deploy:**
   ```bash
   cd "d:\Learning\new node video tool"
   vercel
   ```
   Follow prompts (link to existing project or create new one).

3. **Configure in Vercel Dashboard:**
   - **Project Settings → General**
     - **Root Directory:** leave default (project root) or set to the folder that contains `frontend`.
     - **Build Command:** leave empty if you only serve static files from `frontend`.
     - **Output Directory:** `frontend` (if your built/static files are in `frontend`).
     - **Install Command:** leave default or empty for static-only.

4. **Point frontend to your backend:**
   - In `frontend/index.html` (or your JS), set the API base URL to your deployed backend, e.g.:
     `https://your-backend.railway.app` or `https://your-backend.onrender.com`.
   - Redeploy after changing the URL.

5. **Redeploy:**
   ```bash
   vercel --prod
   ```

---

## 5. Option B: Backend as Serverless on Vercel (Experimental)

### 5.1 Prepare API route

- Create a serverless function that wraps your Express app or only the routes you need (e.g. `api/generate-video`).
- Vercel expects **serverless functions** under `api/` (or the directory configured in `vercel.json`).

Example layout:

```
backend/
  api/
    generate-video.js   # serverless handler that calls your controller
  ...
```

Or use a single catch-all:

```
api/
  [...slug].js   # Vercel serverless; imports Express app and runs it
```

### 5.2 Use `/tmp` for temp files

In the code that writes audio, images, and videos, replace paths under `backend/temp/` with `/tmp/...` (e.g. `/tmp/video-tool/audio`, `/tmp/video-tool/images`, `/tmp/video-tool/videos`). Ensure directories are created if they don’t exist.

### 5.3 Environment variables (Vercel)

In **Project Settings → Environment Variables**, add the same variables you use locally, for example:

- `OPENAI_API_KEY`
- `FLUX_API_KEY` or `FAL_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS` (or paste service account JSON and read from env)
- `GOOGLE_CLOUD_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT`
- `ELEVENLABS_API_KEY` (if using ElevenLabs)
- Any other keys your backend reads from `process.env`

For Google, if you can’t upload a file, use a **single-line JSON string** in an env var and parse it in code instead of `GOOGLE_APPLICATION_CREDENTIALS` file path.

### 5.4 Timeout and body size

- In **Project Settings**, increase **Function Max Duration** (e.g. 60s on Pro) if you still want to try one-shot generation.
- In **Settings → General**, set **Max Request Body Size** if you send large payloads (e.g. script text).

### 5.5 vercel.json (optional)

At the **project root** you can add:

```json
{
  "version": 2,
  "builds": [
    { "src": "backend/server.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "backend/server.js" }
  ],
  "functions": {
    "backend/server.js": {
      "maxDuration": 60
    }
  }
}
```

If you use a single `api/` serverless entry (e.g. `api/[[...slug]].js`) instead of `backend/server.js`, adjust `builds` and `routes` to point to that file. The `maxDuration` only applies on paid plans.

---

## 6. Checklist Before Deploy

- [ ] All secrets and API keys are set in Vercel (and/or in the separate backend platform).
- [ ] Frontend API base URL points to the deployed backend (Option A).
- [ ] If using Option B: temp paths use `/tmp`, timeout and body size are increased, and FFmpeg is available or disabled for serverless.

---

## 7. Summary

| Goal | Suggested approach |
|------|--------------------|
| **Stable, production-like** | **Option A:** Frontend on Vercel, backend on Railway/Render/Fly.io. |
| **Try “all on Vercel”** | **Option B:** Serverless API + `/tmp` + env vars; expect timeouts for full video runs unless you offload to a queue/worker. |

For full video generation (TTS + images + FFmpeg), a **long-running backend** (Railway, Render, etc.) is the most reliable; use Vercel for the frontend and optional lightweight API routes.
