# Workspace

## Overview

pnpm workspace monorepo using TypeScript. YouTube Video Generator — a full-stack app that automates generating long YouTube videos (8+ minutes) using AI.

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
- **AI**: OpenAI via Replit AI Integrations (script generation, TTS audio, image generation)
- **Video**: FFmpeg for audio merging and video assembly with Ken Burns effect

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture

### Frontend (artifacts/youtube-video-gen)
- React + Vite, dark mode cinematic UI
- Form: topic, style, duration, voice, language
- Home page shows all past video jobs
- Video detail page shows real-time SSE progress log and download link

### Backend (artifacts/api-server)
- `GET /api/videos` — list all videos
- `POST /api/videos` — create a new video job
- `GET /api/videos/:id` — get video details
- `POST /api/videos/:id/generate` — run the full pipeline (SSE stream)
- `GET /api/videos/:id/download` — download the final MP4

### Video Pipeline (artifacts/api-server/src/lib/video/)
1. **scriptGenerator.ts** — Uses gpt-5.2 to generate a 10-block narration script with image prompts
2. **audioGenerator.ts** — Converts each block to MP3 using OpenAI TTS (tts-1)
3. **imageGenerator.ts** — Generates 10 cinematic images using gpt-image-1
4. **videoAssembler.ts** — Merges audio with FFmpeg, assembles video with Ken Burns zoom effect

### Database
- `videos` table: id, topic, style, durationMinutes, voice, language, status, progress, errorMessage, outputPath

## Environment Variables Required
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — auto-set by Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-set by Replit AI Integrations
- `DATABASE_URL` — auto-set by Replit DB

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
