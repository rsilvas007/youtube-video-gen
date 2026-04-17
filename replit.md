# Workspace

## Overview

pnpm workspace monorepo using TypeScript. YouTube Video Generator — a full-stack app that automates generating long YouTube videos (8+ minutes) using AI for multiple social media platforms.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI Providers**: OpenAI (TTS, images), ElevenLabs (TTS), Google Gemini (script, TTS, images), Pollinations.ai (images, video clips)
- **Video**: FFmpeg for audio merging and platform-adaptive video assembly (Ken Burns / zoompan effects)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `cd lib/db && pnpm run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture

### Frontend (artifacts/youtube-video-gen)
- React + Vite, dark mode cinematic UI in Portuguese (pt-BR)
- Form fields: topic, style, duration, platform, scriptModel, imageModel, videoModel, voice, language
- **Platform selector**: Visual grid — YouTube 16:9, Reels/TikTok/Shorts 9:16, Instagram Square 1:1, Instagram Vertical 4:5
- Home page shows all past video jobs
- Video detail page shows real-time SSE progress log and download link

### Backend (artifacts/api-server)
- `GET /api/videos` — list all videos
- `POST /api/videos` — create a new video job
- `GET /api/videos/:id` — get video details
- `POST /api/videos/:id/generate` — run the full pipeline (SSE stream)
- `GET /api/videos/:id/download` — download the final MP4

### Video Pipeline (artifacts/api-server/src/lib/video/)
1. **scriptGenerator.ts** — OpenAI GPT script generation (DarkAgent 10-block methodology)
2. **geminiGenerator.ts** — Google Gemini: script generation (2.5 Flash/Pro, 3.x), TTS (2.5-flash-preview-tts), image generation (NanoBanana, NanoBanana Pro, NanoBanana 2)
3. **audioGenerator.ts** — OpenAI TTS (gpt-4o-mini-tts) with emotion per-block
4. **elevenLabsGenerator.ts** — ElevenLabs TTS with voice_settings (stability/similarity_boost/style/speed) per block
5. **imageGenerator.ts** — OpenAI image generation fallback
6. **pollinationsGenerator.ts** — Pollinations.ai: 20+ image models, 9 video clip models
7. **videoAssembler.ts** — Platform-adaptive dimensions (1920×1080 / 1080×1920 / 1080×1080 / 1080×1350), 10 zoompan variants, ffprobe-synced audio durations

### Platform Support (2026 specs)
| Platform | Ratio | Resolution | FPS |
|---|---|---|---|
| YouTube | 16:9 | 1920×1080 | 30 |
| Reels / TikTok / Shorts | 9:16 | 1080×1920 | 30 |
| Instagram Square | 1:1 | 1080×1080 | 30 |
| Instagram Vertical | 4:5 | 1080×1350 | 30 |

### AI Model Selection
- **Script**: Gemini 2.5 Flash (default), Gemini 2.5 Pro, Gemini 3 Flash/Pro Preview, Gemini 3.1 Pro Preview, GPT-4o, GPT-4o Mini
- **Image**: Gemini NanoBanana/NanoBanana2/NanoBanana Pro (native API), Flux variants, GPT Image, Grok, Seedream, Wan, etc.
- **Video Clips**: Seedance, Wan, Veo, Grok Video Pro, LTX-2, p-video, Nova Reel, Ken Burns (local)
- **Voices**: ElevenLabs (9 voices, emotional per-block settings), Google Gemini TTS (8 voices), OpenAI TTS (10 voices)

### Database
- Table: `videos` with columns: id, topic, style, durationMinutes, voice, language, platform, scriptModel, imageModel, videoModel, status, progress, errorMessage, outputPath, createdAt, updatedAt

### API Client (lib/api-client-react)
- `CreateVideoBody` — includes platform, scriptModel, imageModel, videoModel
- `Video` — all fields including new model/platform columns

### Critical Details
- ElevenLabs voice IDs are long UUIDs (detect with `voice.length > 20`)
- Gemini TTS voices use prefix `gemini-tts:VoiceName`
- Gemini TTS returns WAV or raw PCM → auto-converted to MP3 via ffmpeg
- Each image duration = ffprobe(audioPaths[i]) — exact sync, no fixed secondsPerImage
- DB push command: `cd lib/db && pnpm run push`
- FFmpeg: zoompan `s=` uses WxH; scale uses W:H; always `-preset ultrafast`
- Gemini API key auto-detected; USE_GEMINI flag set if GEMINI_API_KEY present
- Pollinations API key auto-detected for USE_POLLINATIONS flag
