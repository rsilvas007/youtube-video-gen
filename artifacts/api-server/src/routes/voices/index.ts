import { Router } from "express";
import https from "https";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const router = Router();
const GEMINI_KEY  = process.env.GEMINI_API_KEY  ?? "";
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY ?? "";

const SAMPLE_TEXT = "Olá! Esta é a minha voz narrando seu próximo vídeo incrível. Cada palavra com emoção e precisão cinematográfica.";

// ─── GEMINI TTS PREVIEW ───────────────────────────────────────────────────────
async function geminiTTSPreview(voiceEntry: string): Promise<Buffer> {
  let voiceName: string;
  let ttsModel: string;

  if (voiceEntry.startsWith("gemini-3.1-tts:")) {
    voiceName = voiceEntry.replace("gemini-3.1-tts:", "");
    ttsModel = "gemini-3.1-flash-tts-preview";
  } else {
    voiceName = voiceEntry.replace("gemini-tts:", "");
    ttsModel = "gemini-2.5-flash-preview-tts";
  }

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: SAMPLE_TEXT }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${ttsModel}:generateContent?key=${GEMINI_KEY}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d: Buffer) => { data += d.toString(); });
      res.on("end", () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`Gemini TTS HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
            return;
          }
          const j = JSON.parse(data);
          const audioPart = j?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (!audioPart?.data) { reject(new Error("No audio data from Gemini TTS")); return; }

          const rawBuf = Buffer.from(audioPart.data, "base64");
          const mimeType: string = audioPart.mimeType ?? "";

          const ts = Date.now();
          const rawPath = path.join(os.tmpdir(), `vp_raw_${ts}.raw`);
          const mp3Path = path.join(os.tmpdir(), `vp_${ts}.mp3`);

          fs.writeFileSync(rawPath, rawBuf);

          // FIX L-02: usar spawn assíncrono — evita bloquear o event loop do Node
          const ffmpegArgs = (mimeType.includes("pcm") || mimeType.includes("l16"))
            ? ["-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", rawPath, "-ar", "44100", "-ac", "1", "-b:a", "128k", mp3Path]
            : ["-y", "-i", rawPath, "-ar", "44100", "-ac", "1", "-b:a", "128k", mp3Path];

          await new Promise<void>((resolveConv, rejectConv) => {
            const proc = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });
            proc.on("close", (code) => {
              if (code === 0) resolveConv();
              else rejectConv(new Error(`ffmpeg exit ${code}`));
            });
            proc.on("error", rejectConv);
          });

          const mp3Buf = fs.readFileSync(mp3Path);
          try { fs.unlinkSync(rawPath); fs.unlinkSync(mp3Path); } catch { /* ignore */ }
          resolve(mp3Buf);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── ELEVENLABS TTS PREVIEW ──────────────────────────────────────────────────
async function elevenLabsPreview(voiceId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text: SAMPLE_TEXT,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });

    const options = {
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${voiceId}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_KEY,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          const errMsg = Buffer.concat(chunks).toString().slice(0, 200);
          reject(new Error(`ElevenLabs ${res.statusCode}: ${errMsg}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── ELEVENLABS VOICE LIST ────────────────────────────────────────────────────
async function fetchElevenLabsVoices(): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.elevenlabs.io",
      path: "/v1/voices",
      method: "GET",
      headers: {
        "xi-api-key": ELEVENLABS_KEY,
        "Accept": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`ElevenLabs ${res.statusCode}: ${Buffer.concat(chunks).toString().slice(0, 200)}`));
          return;
        }
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString());
          resolve((json.voices ?? []) as unknown[]);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// GET /api/voices/elevenlabs — full voice catalogue from ElevenLabs API
router.get("/voices/elevenlabs", async (req, res) => {
  if (!ELEVENLABS_KEY) {
    res.status(503).json({ error: "ELEVENLABS_API_KEY não configurada" });
    return;
  }
  try {
    const voices = await fetchElevenLabsVoices();
    res.json({ voices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── ROUTE ───────────────────────────────────────────────────────────────────
router.get("/voices/preview", async (req, res) => {
  const voice = String(req.query.voice ?? "").trim();

  if (!voice) {
    res.status(400).json({ error: "Parâmetro 'voice' é obrigatório" });
    return;
  }

  try {
    let audioBuf: Buffer;

    if (voice.startsWith("gemini-tts:") || voice.startsWith("gemini-3.1-tts:")) {
      if (!GEMINI_KEY) { res.status(503).json({ error: "GEMINI_API_KEY não configurada" }); return; }
      audioBuf = await geminiTTSPreview(voice);
    } else if (voice.length > 18 && !voice.includes(":")) {
      if (!ELEVENLABS_KEY) { res.status(503).json({ error: "ELEVENLABS_API_KEY não configurada" }); return; }
      audioBuf = await elevenLabsPreview(voice);
    } else {
      res.status(400).json({ error: "Tipo de voz sem suporte para preview (OpenAI não suportado)" });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuf.length);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(audioBuf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
