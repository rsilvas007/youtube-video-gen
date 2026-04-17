import { Router } from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { videosTable } from "@workspace/db";
import { generateScript } from "../../lib/video/scriptGenerator.js";
import { generateAudio } from "../../lib/video/audioGenerator.js";
import { generateAudioWithElevenLabs } from "../../lib/video/elevenLabsGenerator.js";
import { generateImages } from "../../lib/video/imageGenerator.js";
import {
  generatePollinationsImages,
  generatePollinationsVideoClips,
} from "../../lib/video/pollinationsGenerator.js";
import {
  generateScriptWithGemini,
  generateAudioWithGemini,
  generateImagesWithGemini,
  enhanceImagePromptsWithGemini,
  generateYouTubeMetadataWithGemini,
} from "../../lib/video/geminiGenerator.js";
import {
  mergeAudios,
  assembleFromClips,
  assembleVideo,
} from "../../lib/video/videoAssembler.js";

const router = Router();
const USE_POLLINATIONS = !!process.env.POLLINATIONS_API_KEY;
const USE_ELEVENLABS   = !!process.env.ELEVENLABS_API_KEY;
const USE_GEMINI       = !!process.env.GEMINI_API_KEY;

function getVideoWorkDir(videoId: number): string {
  return path.join(os.tmpdir(), "yt-video-gen", String(videoId));
}

async function updateVideo(
  id: number,
  data: Partial<{
    status: string;
    progress: number;
    errorMessage: string | null;
    outputPath: string | null;
    youtubeTitles: string | null;
    youtubeDescription: string | null;
    youtubeTags: string | null;
    youtubeHashtags: string | null;
  }>
): Promise<void> {
  await db
    .update(videosTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(videosTable.id, id));
}

router.get("/videos", async (req, res) => {
  const videos = await db
    .select()
    .from(videosTable)
    .orderBy(videosTable.createdAt);
  res.json(videos);
});

router.post("/videos", async (req, res) => {
  const { topic, style, durationMinutes, voice, language, imageModel, videoModel, scriptModel, platform } = req.body as {
    topic: string;
    style: string;
    durationMinutes: number;
    voice: string;
    language?: string;
    imageModel?: string;
    videoModel?: string;
    scriptModel?: string;
    platform?: string;
  };

  if (!topic || !style || !durationMinutes || !voice) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const [video] = await db
    .insert(videosTable)
    .values({
      topic,
      style,
      durationMinutes,
      voice,
      language: language ?? "pt-BR",
      platform: platform ?? "youtube",
      scriptModel: scriptModel ?? "gemini-2.5-flash",
      imageModel: imageModel ?? "flux-realism",
      videoModel: videoModel ?? "seedance",
    })
    .returning();

  res.status(201).json(video);
});

router.get("/videos/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [video] = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.id, id));

  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }

  res.json(video);
});

router.post("/videos/:id/generate", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [video] = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.id, id));

  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }

  if (video.status === "done") {
    res.status(409).json({ error: "Video is already done" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (step: string, message: string, progress: number) => {
    res.write(`data: ${JSON.stringify({ step, message, progress })}\n\n`);
  };

  const workDir   = getVideoWorkDir(id);
  const audioDir  = path.join(workDir, "audio");
  const imagesDir = path.join(workDir, "images");
  const clipsDir  = path.join(workDir, "clips");
  const outputDir = path.join(workDir, "output");

  try {
    fs.mkdirSync(workDir, { recursive: true });

    // ─── STEP 1: SCRIPT ───────────────────────────────────────────────────────
    const scriptModel = video.scriptModel ?? "gemini-2.5-flash";
    const useGeminiScript = USE_GEMINI && scriptModel.startsWith("gemini");
    const scriptLabel = useGeminiScript ? `Google ${scriptModel}` : `OpenAI ${scriptModel}`;

    sendEvent("script", `✍️ Gerando roteiro com ${scriptLabel}...`, 5);
    await updateVideo(id, { status: "generating_script", progress: 5 });

    let blocks;
    if (useGeminiScript) {
      blocks = await generateScriptWithGemini(video.topic, video.style, video.durationMinutes, video.language, scriptModel);
    } else {
      blocks = await generateScript(video.topic, video.style, video.durationMinutes, video.language);
    }

    sendEvent("script", `Roteiro gerado: ${blocks.length} blocos criados.`, 15);
    await updateVideo(id, { progress: 15 });

    // ─── METADATA (parallel, fire-and-forget with result) ─────────────────────
    if (USE_GEMINI) {
      sendEvent("script", "🎯 Gerando metadados YouTube com Gemini...", 15);
      generateYouTubeMetadataWithGemini(blocks, video.topic, video.style, video.language, scriptModel)
        .then(async (meta) => {
          await updateVideo(id, {
            youtubeTitles: JSON.stringify(meta.titles),
            youtubeDescription: meta.description,
            youtubeTags: JSON.stringify(meta.tags),
            youtubeHashtags: JSON.stringify(meta.hashtags),
          });
        })
        .catch(() => { /* non-fatal */ });
    }

    // ─── STEP 2: AUDIO ────────────────────────────────────────────────────────
    const isElevenLabs = USE_ELEVENLABS && video.voice.length > 20 &&
      !video.voice.startsWith("gemini-tts:") && !video.voice.startsWith("gemini-3.1-tts:");
    const isGeminiTts = USE_GEMINI &&
      (video.voice.startsWith("gemini-tts:") || video.voice.startsWith("gemini-3.1-tts:"));
    const ttsModelLabel = video.voice.startsWith("gemini-3.1-tts:") ? "Gemini 3.1 Flash TTS" : "Gemini 2.5 Flash TTS";
    const audioLabel   = isGeminiTts ? ttsModelLabel : isElevenLabs ? "ElevenLabs" : "OpenAI TTS";

    sendEvent("audio", `🎙️ Gerando áudios com ${audioLabel}...`, 18);
    await updateVideo(id, { status: "generating_audio", progress: 18 });

    let audioPaths: string[];
    if (isGeminiTts) {
      audioPaths = await generateAudioWithGemini(blocks, audioDir, video.voice);
    } else if (isElevenLabs) {
      audioPaths = await generateAudioWithElevenLabs(blocks, audioDir, video.voice);
    } else {
      audioPaths = await generateAudio(blocks, audioDir, video.voice);
    }

    for (let i = 0; i < audioPaths.length; i++) {
      const pct = 18 + Math.round((i + 1) * (17 / audioPaths.length));
      sendEvent("audio", `Áudio ${i + 1}/${audioPaths.length} gerado.`, pct);
      await updateVideo(id, { progress: pct });
    }
    sendEvent("audio", "Todos os áudios gerados.", 35);
    await updateVideo(id, { progress: 35 });

    const fullAudioPath  = await mergeAudios(audioPaths, outputDir);
    const outputVideoPath = path.join(outputDir, "video_final.mp4");

    // ─── STEP 3: IMAGES ───────────────────────────────────────────────────────
    const imageModel = video.imageModel ?? "flux-realism";
    const useGeminiImg = USE_GEMINI && (imageModel.startsWith("gemini-") || imageModel.startsWith("nano-"));

    // Enhance image prompts with Gemini before any image generation
    if (USE_GEMINI) {
      sendEvent("images", "✨ Aprimorando prompts de imagem com Gemini...", 36);
      try {
        blocks = await enhanceImagePromptsWithGemini(blocks, video.style, video.topic, scriptModel);
        sendEvent("images", "Prompts cinematográficos aprimorados.", 37);
      } catch { /* non-fatal, use original prompts */ }
    }

    let imagePaths: string[];

    if (useGeminiImg) {
      sendEvent("images", `🖼️ Gerando imagens com Google ${imageModel}...`, 37);
      await updateVideo(id, { status: "generating_images", progress: 37 });
      imagePaths = await generateImagesWithGemini(blocks, imagesDir, video.style, imageModel);
    } else if (USE_POLLINATIONS) {
      sendEvent("images", `🎨 Gerando imagens com Pollinations (${imageModel})...`, 37);
      await updateVideo(id, { status: "generating_images", progress: 37 });
      imagePaths = await generatePollinationsImages(blocks, imagesDir, video.style, imageModel);
    } else {
      sendEvent("images", "Gerando imagens com OpenAI...", 37);
      await updateVideo(id, { status: "generating_images", progress: 37 });
      imagePaths = await generateImages(blocks, imagesDir, video.style);
    }

    for (let i = 0; i < imagePaths.length; i++) {
      const pct = 37 + Math.round((i + 1) * (18 / imagePaths.length));
      sendEvent("images", `Imagem ${i + 1}/${imagePaths.length} gerada.`, pct);
      await updateVideo(id, { progress: pct });
    }
    sendEvent("images", "Todas as imagens geradas.", 55);
    await updateVideo(id, { progress: 55 });

    // ─── STEP 4: VIDEO CLIPS ──────────────────────────────────────────────────
    const videoModel = video.videoModel ?? "seedance";

    if (USE_POLLINATIONS && !videoModel.startsWith("ken-burns")) {
      sendEvent("video", `🎬 Gerando clipes com Pollinations (${videoModel})...`, 57);
      await updateVideo(id, { status: "generating_clips", progress: 57 });

      const rawClipPaths = await generatePollinationsVideoClips(blocks, audioPaths, clipsDir, videoModel);

      const successClips: string[] = [];
      const failedIndexes: number[] = [];

      for (let i = 0; i < rawClipPaths.length; i++) {
        const p = rawClipPaths[i];
        const pct = 57 + Math.round((i + 1) * (28 / rawClipPaths.length));
        if (p.startsWith("__FAILED__:")) {
          failedIndexes.push(i);
          sendEvent("video", `⚠️ Clipe ${i + 1} falhou, usando imagem animada.`, pct);
        } else {
          successClips.push(p);
          sendEvent("video", `✅ Clipe ${i + 1}/${blocks.length} gerado.`, pct);
        }
        await updateVideo(id, { progress: pct });
      }

      sendEvent("video", "Montando vídeo final...", 87);
      await updateVideo(id, { status: "assembling_video", progress: 87 });

      const vPlatform = video.platform ?? "youtube";
      if (successClips.length === blocks.length) {
        await assembleFromClips(successClips, fullAudioPath, outputVideoPath, vPlatform);
      } else if (successClips.length > 0) {
        const resolvedPaths = rawClipPaths.map((p, i) =>
          p.startsWith("__FAILED__:") ? imagePaths[i] : p
        );
        await assembleFromClips(resolvedPaths, fullAudioPath, outputVideoPath, vPlatform);
      } else {
        sendEvent("video", "⚠️ Usando animação dinâmica de imagens...", 87);
        await assembleVideo(imagePaths, audioPaths, fullAudioPath, outputVideoPath, vPlatform);
      }
    } else {
      const vPlatform = video.platform ?? "youtube";
      sendEvent("video", "Montando vídeo com animações sincronizadas ao áudio...", 60);
      await updateVideo(id, { status: "assembling_video", progress: 60 });
      await assembleVideo(imagePaths, audioPaths, fullAudioPath, outputVideoPath, vPlatform);
    }

    sendEvent("video", "Vídeo montado com sucesso!", 95);
    await updateVideo(id, { status: "done", progress: 100, outputPath: outputVideoPath });
    sendEvent("done", "Finalizado! Seu vídeo está pronto para download.", 100);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido no pipeline.";
    sendEvent("error", `Erro: ${message}`, 0);
    await updateVideo(id, { status: "error", errorMessage: message });
    res.write(`data: ${JSON.stringify({ done: true, error: message })}\n\n`);
    res.end();
  }
});

router.get("/videos/:id/download", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [video] = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.id, id));

  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }

  if (!video.outputPath || !fs.existsSync(video.outputPath)) {
    res.status(404).json({ error: "Video file not ready" });
    return;
  }

  const filename = `video_${video.topic.slice(0, 30).replace(/\s+/g, "_")}.mp4`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "video/mp4");
  fs.createReadStream(video.outputPath).pipe(res);
});

export default router;
