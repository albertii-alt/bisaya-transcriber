# Bisaya Transcriber

A mobile-first web app tailored for iPhone that transcribes long audio (up to ~2 hours, mostly Cebuano/Bisaya) into one complete verbatim plain-text transcript using the Google Gemini API.

Built with **React**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and **Vercel Serverless Functions** in `/api`.

---

## Key Features

- **Full Verbatim Transcription**: No speaker labels, no timestamps, no summaries, no translation, no skips.
- **Server-Relayed Chunked Uploads**: Slices audio files into 3 MiB binary chunks posted to `/api/upload-chunk`, which safely relays them to Google Gemini Files API. This completely avoids browser CORS restrictions and stays comfortably within Vercel's 4.5 MB body limit.
- **Auto-Resume & Exponential Backoff**: On any network hitch or 5xx, retries up to 6 times with exponential backoff (2s, 4s, 8s, 16s...), querying `/api/upload-status` to resume from the exact confirmed byte offset.
- **Smart Chunking & Completeness Assurance**: Slices long audio into sequential ~6-minute chunks with context continuity (`previousTail`). If a chunk drops below ~60 wpm, has an unexpected finish reason, or is empty, it automatically sub-divides the range in half and retries.
- **Resume Anywhere**: Progress is saved to `localStorage` after every chunk. You can safely close or reload your tab and resume where you left off.
- **Screen Wake Lock**: Automatically requests a screen lock on iOS Safari to keep the screen on while processing.
- **Apple HIG Mobile Experience**: Native iOS look and feel with translucent blur bars, clean typography, 44px+ tap targets, circular progress ring, text size adjustments (A−/A+), search highlighting, and native sharing.
- **Zero Client-Side Key Exposure**: The Gemini API key is never exposed to the browser. All API requests are protected by your personal `x-passcode`.

---

## ⚙️ How to Change the Model Name and Chunk Size

The central server configuration is in `/api/_config.ts`.

```typescript
// Located in /api/_config.ts:
export const CONFIG = {
  // 🎙️ Change model here (or set GEMINI_MODEL env var)
  DEFAULT_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-transcribe',

  // ⏱️ Change chunk size in minutes here (or set CHUNK_MINUTES env var)
  DEFAULT_CHUNK_MINUTES: parseInt(process.env.CHUNK_MINUTES || '6', 10),
};
```

---

## 🚀 Vercel Deployment Guide

### 1. Push or Import to GitHub / GitLab
Push this codebase to your Git repository.

### 2. Import into Vercel
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New** → **Project**.
3. Select your repository.
4. Framework Preset: **Vite** (Vercel automatically detects `vercel.json`).

### 3. Configure Environment Variables
Under the **Environment Variables** section in the Vercel dashboard, add the following:

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Required.** Your Google Gemini API key from Google AI Studio. | `AIzaSy...` |
| `APP_PASSCODE` | **Required.** Your secret passcode to unlock the app and authenticate `/api` routes. | `MySecretPass123` |
| `GEMINI_MODEL` | *Optional.* Model used for audio transcription. Defaults to `gemini-3.5-transcribe`. | `gemini-3.5-transcribe` |
| `CHUNK_MINUTES` | *Optional.* Length of each chunk in minutes. Defaults to `6`. | `6` |

> **Note on Vercel Function Timeout**: `vercel.json` is configured with `"maxDuration": 60` for `/api/upload-chunk.ts` and `/api/upload-status.ts`, and `"maxDuration": 300` (5 minutes) for long audio chunk transcription `/api/**/*.ts`.

### 4. Deploy
Click **Deploy**. Once built, open the deployed URL on your iPhone Safari, tap **Share** → **Add to Home Screen** for a full native PWA-like experience!

---

## 💻 Local Full-Stack Development

To run both the Vite frontend and local Express `/api` proxy in development:

```bash
# 1. Install dependencies
npm install

# 2. Copy and set your environment variables
cp .env.example .env

# 3. Start local development server (runs full-stack Express + Vite on port 3000)
npm run dev
```

Visit `http://localhost:3000` in your browser.
