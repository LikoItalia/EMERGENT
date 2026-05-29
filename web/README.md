# Context — Web

Premium web app companion of the Context mobile app. Same backend, same JWT, same library, same Stripe subscription.

## Stack
- Vite + React 18 + TypeScript
- Native `MediaRecorder` API for desktop microphone
- Same FastAPI backend at `VITE_API_URL`

## Local development
```bash
cd /app/web
yarn install
yarn dev   # http://localhost:5173
```

## Deploy on Vercel
1. Push this folder to GitHub (or just the `/app/web` subdirectory)
2. Import the repo on https://vercel.com/new
3. Framework Preset: **Vite**
4. Add environment variable:
   - `VITE_API_URL` = your backend URL (e.g. `https://premium-subtitles.preview.emergentagent.com`)
5. Deploy.

The included `vercel.json` already handles SPA fallback routing.

## How it works
- Login/register hit `/api/auth/login` and `/api/auth/register` — same JWT as mobile
- Microphone recorded in 4s chunks via `MediaRecorder` → POSTed to `/api/transcribe`
- Click a word → `/api/explain` (Claude Haiku) → auto-saved to `/api/library/save`
- Library, Stripe checkout and subscription state are shared across all devices.
