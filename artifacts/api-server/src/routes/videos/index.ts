import { Router } from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { videosTable } from "@workspace/db";
import { generateScript } from "../../lib/video/scriptGenerator.js";
import { generateAudio } from "../../lib/video/audioGenerator.js";
import { generateImages } from "../../lib/video/imageGenerator.js";
import {
  generatePollinationsImages,
  generatePollinationsVideoClips,
} from "../../lib/video/pollinationsGenerator.js";
import {
  mergeAudios,
  assembleFromClips,
  assembleVideo,
} from "../../lib/video/videoAssembler.js";

const router = Router();
const USE_POLLINATIONS = !!process.env.POLLINATIONS_API_KEY;

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
  const { topic, style, durationMinutes, voice, language } = req.body as {
    topic: string;
    style: string;
    durationMinutes: number;
    voice: string;
    language?: string;
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
    res.write(
      `data: ${JSON.stringify({ step, message, progress })}\n\n`
    );
  };

  const workDir = getVideoWorkDir(id);
  const audioDir = path.join(workDir, "audio");
  const imagesDir = path.join(workDir, "images");
  const clipsDir = path.join(workDir, "clips");
  const outputDir = path.join(workDir, "output");

  try {
    fs.mkdirSync(workDir, { recursive: true });

    // ─── STEP 1: SCRIPT ────────────────────────────────────────────
    sendEvent("script", "Gerando roteiro com IA...", 5);
    await updateVideo(id, { status: "generating_script", progress: 5 });

    const blocks = await generateScript(
      video.topic,
      video.style,
      video.durationMinutes,
      video.language
    );
    sendEvent("script", `Roteiro gerado: ${blocks.length} blocos criados.`, 15);
    await updateVideo(id, { progress: 15 });

    // ─── STEP 2: AUDIO ─────────────────────────────────────────────
    sendEvent("audio", "Gerando áudios com emoção por bloco...", 18);
    await updateVideo(id, { status: "generating_audio", progress: 18 });

    const audioPaths = await generateAudio(blocks, audioDir, video.voice);
    for (let i = 0; i < audioPaths.length; i++) {
      const pct = 18 + Math.round((i + 1) * (17 / audioPaths.length));
      sendEvent("audio", `Áudio ${i + 1}/${audioPaths.length} gerado.`, pct);
      await updateVideo(id, { progress: pct });
    }
    sendEvent("audio", "Todos os áudios gerados.", 35);
    await updateVideo(id, { progress: 35 });

    // ─── STEP 3: IMAGES ────────────────────────────────────────────
    const fullAudioPath = await mergeAudios(audioPaths, outputDir);
    const outputVideoPath = path.join(outputDir, "video_final.mp4");

    if (USE_POLLINATIONS) {
      sendEvent("images", "🎨 Gerando imagens cinematográficas com Pollinations.ai...", 37);
      await updateVideo(id, { status: "generating_images", progress: 37 });

      const imagePaths = await generatePollinationsImages(blocks, imagesDir, video.style, video.imageModel);
      for (let i = 0; i < imagePaths.length; i++) {
        const pct = 37 + Math.round((i + 1) * (18 / imagePaths.length));
        sendEvent("images", `Imagem ${i + 1}/${imagePaths.length} gerada com Pollinations.`, pct);
        await updateVideo(id, { progress: pct });
      }
      sendEvent("images", "Todas as imagens geradas.", 55);
      await updateVideo(id, { progress: 55 });

      // ─── STEP 4: VIDEO CLIPS (Pollinations) ─────────────────────
      sendEvent("video", "🎬 Gerando clipes de vídeo com IA (Seedance/Wan)...", 57);
      await updateVideo(id, { status: "generating_clips", progress: 57 });

      const rawClipPaths = await generatePollinationsVideoClips(blocks, audioPaths, clipsDir, video.videoModel);

      const successClips: string[] = [];
      const failedIndexes: number[] = [];

      for (let i = 0; i < rawClipPaths.length; i++) {
        const p = rawClipPaths[i];
        const pct = 57 + Math.round((i + 1) * (28 / rawClipPaths.length));
        if (p.startsWith("__FAILED__:")) {
          failedIndexes.push(i);
          sendEvent("video", `⚠️ Clipe ${i + 1} falhou, usando imagem animada como fallback.`, pct);
        } else {
          successClips.push(p);
          sendEvent("video", `✅ Clipe ${i + 1}/${blocks.length} gerado.`, pct);
        }
        await updateVideo(id, { progress: pct });
      }

      sendEvent("video", "Montando vídeo final...", 87);
      await updateVideo(id, { status: "assembling_video", progress: 87 });

      if (successClips.length === blocks.length) {
        // All clips succeeded — concat them directly
        await assembleFromClips(successClips, fullAudioPath, outputVideoPath);
      } else if (successClips.length > 0) {
        // Some failed — mix real clips with Ken Burns on failed blocks
        const resolvedPaths: string[] = [];
        for (let i = 0; i < rawClipPaths.length; i++) {
          if (!rawClipPaths[i].startsWith("__FAILED__:")) {
            resolvedPaths.push(rawClipPaths[i]);
          } else {
            resolvedPaths.push(imagePaths[i]);
          }
        }
        await assembleFromClips(resolvedPaths, fullAudioPath, outputVideoPath);
      } else {
        // All clips failed — fall back to full zoompan
        sendEvent("video", "⚠️ Clipes indisponíveis, usando animação dinâmica de imagens...", 87);
        await assembleVideo(imagePaths, audioPaths, fullAudioPath, outputVideoPath);
      }

    } else {
      // No Pollinations key — use OpenAI for images + zoompan animation
      sendEvent("images", "Gerando imagens cinematográficas com IA...", 37);
      await updateVideo(id, { status: "generating_images", progress: 37 });

      const imagePaths = await generateImages(blocks, imagesDir, video.style);
      for (let i = 0; i < imagePaths.length; i++) {
        const pct = 37 + Math.round((i + 1) * (18 / imagePaths.length));
        sendEvent("images", `Imagem ${i + 1}/${imagePaths.length} gerada.`, pct);
        await updateVideo(id, { progress: pct });
      }
      sendEvent("images", "Todas as imagens geradas.", 55);

      sendEvent("video", "Montando vídeo com animações sincronizadas ao áudio...", 60);
      await updateVideo(id, { status: "assembling_video", progress: 60 });

      await assembleVideo(imagePaths, audioPaths, fullAudioPath, outputVideoPath);
    }

    sendEvent("video", "Vídeo montado com sucesso!", 95);
    await updateVideo(id, {
      status: "done",
      progress: 100,
      outputPath: outputVideoPath,
    });

    sendEvent("done", "Finalizado! Seu vídeo está pronto para download.", 100);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro desconhecido no pipeline.";
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
