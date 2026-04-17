import { Router } from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { videosTable } from "@workspace/db";
import { generateScript } from "../../lib/video/scriptGenerator.js";
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
  parseCustomScriptWithGemini,
} from "../../lib/video/geminiGenerator.js";
import {
  mergeAudios,
  assembleFromClips,
  assembleVideo,
  burnSubtitles,
  getAudioDurations,
  PLATFORM_SPECS,
} from "../../lib/video/videoAssembler.js";
import { generateASSSubtitles } from "../../lib/video/subtitleGenerator.js";

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

router.delete("/videos", async (req, res) => {
  const { status } = req.query;
  if (status) {
    await db.delete(videosTable).where(eq(videosTable.status, String(status)));
  } else {
    await db.delete(videosTable);
  }
  res.json({ ok: true });
});

router.delete("/videos/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(videosTable).where(eq(videosTable.id, id));
  res.json({ ok: true });
});

function getBlockCount(durationMinutes: number): number {
  if (durationMinutes <= 0.75) return 3;
  if (durationMinutes <= 1.5)  return 4;
  if (durationMinutes <= 2.5)  return 5;
  if (durationMinutes <= 4)    return 6;
  if (durationMinutes <= 6.5)  return 8;
  return 10;
}

router.post("/videos", async (req, res) => {
  const { topic, style, durationMinutes, voice, language, imageModel, videoModel, scriptModel, platform, customScript, subtitleStyle } = req.body as {
    topic: string;
    style: string;
    durationMinutes: number;
    voice: string;
    language?: string;
    imageModel?: string;
    videoModel?: string;
    scriptModel?: string;
    platform?: string;
    customScript?: string;
    subtitleStyle?: string;
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
      customScript: customScript?.trim() || null,
      subtitleStyle: subtitleStyle ?? "none",
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
    // FIX L-01: limpar workDir de runs anteriores para evitar arquivos parciais
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workDir, { recursive: true });

    // ─── STEP 1: SCRIPT ───────────────────────────────────────────────────────
    const scriptModel = video.scriptModel ?? "gemini-2.5-flash";
    const hasCustomScript = !!(video.customScript?.trim());

    let blocks;

    if (hasCustomScript) {
      sendEvent("script", "📝 Processando roteiro personalizado com Gemini...", 5);
      await updateVideo(id, { status: "generating_script", progress: 5 });
      blocks = USE_GEMINI
        ? await parseCustomScriptWithGemini(video.customScript!, video.topic, video.style, video.language, scriptModel)
        : (() => {
            const words = video.customScript!.trim().split(/\s+/);
            const size = Math.ceil(words.length / 10);
            return Array.from({ length: 10 }, (_, i) => ({
              blockNumber: i + 1,
              text: words.slice(i * size, (i + 1) * size).join(" "),
              imagePrompt: `Cinematic shot, dramatic lighting, ${video.style} mood, ultra-sharp 8K, photorealistic, no text`,
              cameraMovement: "slow zoom" as const,
              visualType: "wide" as const,
            })).filter(b => b.text.trim());
          })();
      sendEvent("script", `✅ Roteiro dividido em ${blocks.length} blocos com prompts de imagem.`, 15);
    } else {
      const useGeminiScript = USE_GEMINI && scriptModel.startsWith("gemini");
      const scriptLabel = useGeminiScript ? `Google ${scriptModel}` : `OpenAI ${scriptModel}`;
      sendEvent("script", `✍️ Gerando roteiro com ${scriptLabel}...`, 5);
      await updateVideo(id, { status: "generating_script", progress: 5 });
      if (useGeminiScript) {
        try {
          blocks = await generateScriptWithGemini(video.topic, video.style, video.durationMinutes, video.language, scriptModel, getBlockCount(video.durationMinutes));
        } catch (scriptErr) {
          const errMsg = scriptErr instanceof Error ? scriptErr.message : String(scriptErr);
          const isOverload = errMsg.includes("503") || errMsg.includes("overload") || errMsg.includes("UNAVAILABLE");
          const fallbackModel = "gemini-2.0-flash";
          if (isOverload && scriptModel !== fallbackModel) {
            sendEvent("script", `⚡ ${scriptModel} sobrecarregado — usando ${fallbackModel}...`, 7);
            blocks = await generateScriptWithGemini(video.topic, video.style, video.durationMinutes, video.language, fallbackModel, getBlockCount(video.durationMinutes));
          } else {
            throw scriptErr;
          }
        }
      } else {
        // FIX A-02: generateScript usa o scriptModel parametrizado corretamente
        blocks = await generateScript(video.topic, video.style, video.durationMinutes, video.language, getBlockCount(video.durationMinutes));
      }
      sendEvent("script", `Roteiro gerado: ${blocks.length} blocos criados.`, 15);
    }

    await updateVideo(id, { progress: 15 });

    // ─── METADATA (fire-and-forget) ────────────────────────────────────────────
    if (USE_GEMINI) {
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
    const isGeminiTts = USE_GEMINI &&
      (video.voice.startsWith("gemini-tts:") || video.voice.startsWith("gemini-3.1-tts:"));
    const isElevenLabs = USE_ELEVENLABS && !isGeminiTts && video.voice.length > 20;
    const effectiveVoice = (!isGeminiTts && !isElevenLabs)
      ? "gemini-tts:Charon"
      : video.voice;
    const ttsModelLabel = effectiveVoice.startsWith("gemini-3.1-tts:") ? "Gemini 3.1 Flash TTS" : "Gemini 2.5 Flash TTS";
    const audioLabel = isGeminiTts ? ttsModelLabel : isElevenLabs ? "ElevenLabs" : ttsModelLabel;

    sendEvent("audio", `🎙️ Gerando ${blocks.length} áudios com ${audioLabel}...`, 18);
    await updateVideo(id, { status: "generating_audio", progress: 18 });

    // FIX A-01: callback por bloco para SSE em tempo real
    let audioDoneCount = 0;
    const onAudioBlockDone = async (_blockIdx: number, total: number) => {
      audioDoneCount++;
      const pct = 18 + Math.round(audioDoneCount * (17 / total));
      sendEvent("audio", `🎵 Áudio ${audioDoneCount}/${total} gerado.`, pct);
      await updateVideo(id, { progress: pct });
    };

    let audioPaths: string[];
    if (isElevenLabs) {
      audioPaths = await generateAudioWithElevenLabs(blocks, audioDir, effectiveVoice, onAudioBlockDone);
    } else {
      audioPaths = await generateAudioWithGemini(blocks, audioDir, effectiveVoice, onAudioBlockDone);
    }

    sendEvent("audio", "✅ Todos os áudios gerados.", 35);
    await updateVideo(id, { progress: 35 });

    const fullAudioPath  = await mergeAudios(audioPaths, outputDir);
    const outputVideoPath = path.join(outputDir, "video_final.mp4");

    // ─── STEP 3: IMAGES ───────────────────────────────────────────────────────
    const imageModel = video.imageModel ?? "flux-realism";
    const useGeminiImg = USE_GEMINI && (imageModel.startsWith("gemini-") || imageModel.startsWith("nano-"));

    if (USE_GEMINI) {
      sendEvent("images", "✨ Aprimorando prompts de imagem com Gemini...", 36);
      try {
        blocks = await enhanceImagePromptsWithGemini(blocks, video.style, video.topic, scriptModel);
        sendEvent("images", "Prompts cinematográficos aprimorados.", 37);
      } catch { /* non-fatal, usa prompts originais */ }
    }

    let imagePaths: string[];

    if (useGeminiImg) {
      sendEvent("images", `🖼️ Gerando imagens com Google ${imageModel}...`, 37);
      await updateVideo(id, { status: "generating_images", progress: 37 });
      try {
        imagePaths = await generateImagesWithGemini(blocks, imagesDir, video.style, imageModel);
      } catch (geminiImgErr) {
        const errMsg = geminiImgErr instanceof Error ? geminiImgErr.message : String(geminiImgErr);
        const is429 = errMsg.includes("429");
        sendEvent("images",
          is429
            ? "⚠️ Quota Gemini esgotada — usando Pollinations como fallback..."
            : `⚠️ Gemini imagem falhou — usando Pollinations como fallback...`,
          37
        );
        imagePaths = await generatePollinationsImages(blocks, imagesDir, video.style, "flux-realism");
      }
    } else if (USE_POLLINATIONS) {
      sendEvent("images", `🎨 Gerando imagens com Pollinations (${imageModel})...`, 37);
      await updateVideo(id, { status: "generating_images", progress: 37 });
      imagePaths = await generatePollinationsImages(blocks, imagesDir, video.style, imageModel);
    } else {
      sendEvent("images", "🎨 Gerando imagens com Pollinations...", 37);
      await updateVideo(id, { status: "generating_images", progress: 37 });
      imagePaths = await generatePollinationsImages(blocks, imagesDir, video.style, "flux-realism");
    }

    for (let i = 0; i < imagePaths.length; i++) {
      const pct = 37 + Math.round((i + 1) * (18 / imagePaths.length));
      sendEvent("images", `🖼️ Imagem ${i + 1}/${imagePaths.length} gerada.`, pct);
      await updateVideo(id, { progress: pct });
    }
    sendEvent("images", "✅ Todas as imagens geradas.", 55);
    await updateVideo(id, { progress: 55 });

    // ─── STEP 4: VIDEO CLIPS ──────────────────────────────────────────────────
    const videoModel = video.videoModel ?? "seedance";
    const vPlatform = video.platform ?? "youtube";

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

      sendEvent("video", "🎞️ Montando vídeo final...", 87);
      await updateVideo(id, { status: "assembling_video", progress: 87 });

      if (successClips.length === blocks.length) {
        // Todos os clipes OK — usa assembleFromClips normalmente
        await assembleFromClips(successClips, fullAudioPath, outputVideoPath, vPlatform);
      } else if (failedIndexes.length === 0) {
        // Nenhum falhou (redundante mas seguro)
        await assembleFromClips(rawClipPaths, fullAudioPath, outputVideoPath, vPlatform);
      } else {
        // FIX C-03: qualquer clip falhou → usa assembleVideo com imagens (aceita JPG/PNG)
        // NUNCA passar imagePaths[i] para assembleFromClips — FFmpeg só aceita MP4 lá
        sendEvent("video", "⚠️ Alguns clipes falharam — montando com animação dinâmica de imagens...", 87);
        await assembleVideo(imagePaths, audioPaths, fullAudioPath, outputVideoPath, vPlatform);
      }
    } else {
      sendEvent("video", "🎞️ Montando vídeo com animações sincronizadas ao áudio...", 60);
      await updateVideo(id, { status: "assembling_video", progress: 60 });
      await assembleVideo(imagePaths, audioPaths, fullAudioPath, outputVideoPath, vPlatform);
    }

    sendEvent("video", "✅ Vídeo montado com sucesso!", 92);
    await updateVideo(id, { progress: 92 });

    // ─── STEP 5: SUBTITLES ────────────────────────────────────────────────────
    const subtitleStyle = video.subtitleStyle ?? "none";
    if (subtitleStyle !== "none") {
      try {
        sendEvent("subtitles", `💬 Gerando legendas estilo "${subtitleStyle}"...`, 93);
        await updateVideo(id, { progress: 93 });

        const assPath = path.join(outputDir, "subtitles.ass");
        const subtitledPath = path.join(outputDir, "video_subtitled.mp4");
        const spec = PLATFORM_SPECS[video.platform ?? "youtube"] ?? PLATFORM_SPECS["youtube"];
        const audioDurs = await getAudioDurations(audioPaths);

        // FIX L-03: sem emojis no estilo viral para evitar problema com libass sem fonte emoji
        const subtitleBlocks = blocks.map((b, i) => ({ blockNumber: i + 1, text: b.text ?? "" }));
        const generated = generateASSSubtitles(
          subtitleBlocks,
          audioDurs,
          subtitleStyle,
          assPath,
          spec.w,
          spec.h,
        );

        if (generated) {
          sendEvent("subtitles", "🎨 Renderizando legendas no vídeo...", 95);
          await updateVideo(id, { progress: 95 });
          await burnSubtitles(outputVideoPath, assPath, subtitledPath);
          fs.renameSync(subtitledPath, outputVideoPath);
          sendEvent("subtitles", "✅ Legendas aplicadas!", 97);
          await updateVideo(id, { progress: 97 });
        }
      } catch (subErr) {
        const msg = subErr instanceof Error ? subErr.message : String(subErr);
        console.error("Subtitle generation failed (non-fatal):", msg);
        sendEvent("subtitles", `⚠️ Legendas falharam (vídeo sem legenda): ${msg.slice(0, 80)}`, 97);
      }
    }

    await updateVideo(id, { status: "done", progress: 100, outputPath: outputVideoPath });
    sendEvent("done", "🎉 Finalizado! Seu vídeo está pronto para download.", 100);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido no pipeline.";
    sendEvent("error", `❌ Erro: ${message}`, 0);
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
