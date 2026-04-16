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
  mergeAudios,
  assembleVideo,
} from "../../lib/video/videoAssembler.js";

const router = Router();

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
  const outputDir = path.join(workDir, "output");

  try {
    fs.mkdirSync(workDir, { recursive: true });

    sendEvent("script", "Gerando roteiro com IA...", 5);
    await updateVideo(id, { status: "generating_script", progress: 5 });

    const blocks = await generateScript(
      video.topic,
      video.style,
      video.durationMinutes,
      video.language
    );
    sendEvent("script", `Roteiro gerado: ${blocks.length} blocos criados.`, 15);

    sendEvent("audio", "Gerando áudios de narração...", 20);
    await updateVideo(id, { status: "generating_audio", progress: 20 });

    const audioPaths = await generateAudio(blocks, audioDir, video.voice);
    for (let i = 0; i < audioPaths.length; i++) {
      const pct = 20 + Math.round((i + 1) * (20 / audioPaths.length));
      sendEvent("audio", `Áudio ${i + 1}/${audioPaths.length} gerado.`, pct);
      await updateVideo(id, { progress: pct });
    }
    sendEvent("audio", "Todos os áudios gerados.", 40);

    sendEvent("images", "Gerando imagens cinematográficas com IA...", 42);
    await updateVideo(id, { status: "generating_images", progress: 42 });

    const imagePaths = await generateImages(blocks, imagesDir);
    for (let i = 0; i < imagePaths.length; i++) {
      const pct = 42 + Math.round((i + 1) * (20 / imagePaths.length));
      sendEvent("images", `Imagem ${i + 1}/${imagePaths.length} gerada.`, pct);
      await updateVideo(id, { progress: pct });
    }
    sendEvent("images", "Todas as imagens geradas.", 62);

    sendEvent("video", "Mesclando áudios...", 65);
    await updateVideo(id, { status: "assembling_video", progress: 65 });

    const fullAudioPath = await mergeAudios(audioPaths, outputDir);
    sendEvent("video", "Áudio completo criado.", 70);

    sendEvent("video", "Montando vídeo com efeito Ken Burns...", 75);
    await updateVideo(id, { progress: 75 });

    const outputVideoPath = path.join(outputDir, "video_final.mp4");
    const secondsPerImage = Math.max(
      6,
      Math.round((video.durationMinutes * 60) / blocks.length)
    );

    await assembleVideo(
      imagePaths,
      fullAudioPath,
      outputVideoPath,
      secondsPerImage
    );

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
