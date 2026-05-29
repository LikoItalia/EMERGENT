# Context — PRD

## Overview
Premium dark mobile app for real-time AI subtitles. Tap any word during a meeting or live event → see definition, domain badge, and ready-to-use phrase. Auto-saved to a personal library organized by sector.

## Stack
- Expo SDK 54 (React Native) — file-based routing
- FastAPI + MongoDB (motor)
- OpenAI Whisper (via Emergent Universal Key) — audio transcription
- Anthropic Claude Haiku 4.5 (via emergentintegrations) — term explanation
- Stripe — €9/month subscription (test keys)
- JWT (PyJWT + bcrypt) — custom auth

## Features Implemented
- Email/password auth with 7-day trial (register, login, /me)
- Tab navigation: Home, Online, Live, Library, Settings
- Real-time chunk-based audio transcription (4s chunks → Whisper)
- Clickable subtitle words → bottom sheet with definition + domain badge + "Cosa dire"
- Auto-save tapped words to library
- Library grouped by AI-generated domain (Finance, Tech, Legal, etc.) — search, delete word, clear domain
- Live mode: large text in landscape orientation
- Settings: 5 languages (it/en/es/fr/de), subscription status, Stripe upgrade, logout
- Premium dark UI: #050508 bg, #7c50ff primary, custom "C" logo, glassmorphism tab bar

## API Endpoints
- POST /api/auth/register, /api/auth/login, GET /api/auth/me, PATCH /api/auth/language
- POST /api/transcribe (multipart audio)
- POST /api/explain (word, context, language → definition/domain/what_to_say)
- POST /api/library/save, GET /api/library/words
- DELETE /api/library/word/{id}, DELETE /api/library/domain/{name}
- POST /api/billing/create-checkout-session, GET /api/billing/status
