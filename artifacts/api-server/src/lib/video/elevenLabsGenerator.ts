import https from "https";
import fs from "fs";
import path from "path";
import type { ScriptBlock } from "./scriptGenerator.js";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const BASE_URL = "api.elevenlabs.io";
const MODEL_ID = "eleven_multilingual_v2";

export const ELEVENLABS_VOICES = [
  { id: "7u8qsX4HQsSHJ0f8xsQZ", name: "João Pedro (PT Brasileiro)", lang: "pt" },
  { id: "TD909tfKkCKoStDEEElr", name: "Rafael Pereira (Multilingual)", lang: "multi" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel (Narrador)", lang: "en" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (Storyteller)", lang: "en" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian (Deep)", lang: "en" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill (Sábio)", lang: "en" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum (Intenso)", lang: "en" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Feminina)", lang: "en" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda (Profissional)", lang: "en" },
];

// Emotional voice settings per block (stability, similarity_boost, style, use_speaker_boost)
const BLOCK_VOICE_SETTINGS: Record<number, {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
}> = {
  1:  { stability: 0.25, similarity_boost: 0.85, style: 0.90, use_speaker_boost: true,  speed: 0.92 }, // HOOK — intense
  2:  { stability: 0.35, similarity_boost: 0.80, style: 0.75, use_speaker_boost: true,  speed: 0.95 }, // Emotional stakes
  3:  { stability: 0.55, similarity_boost: 0.78, style: 0.55, use_speaker_boost: true,  speed: 1.00 }, // Setup — steady
  4:  { stability: 0.45, similarity_boost: 0.82, style: 0.65, use_speaker_boost: true,  speed: 0.98 }, // Deep dive
  5:  { stability: 0.20, similarity_boost: 0.88, style: 0.95, use_speaker_boost: true,  speed: 0.88 }, // Mini cliffhanger — dramatic
  6:  { stability: 0.40, similarity_boost: 0.80, style: 0.70, use_speaker_boost: true,  speed: 0.95 }, // Scale reveal
  7:  { stability: 0.60, similarity_boost: 0.75, style: 0.50, use_speaker_boost: false, speed: 0.97 }, // Human perspective — warm
  8:  { stability: 0.15, similarity_boost: 0.90, style: 1.00, use_speaker_boost: true,  speed: 0.85 }, // CLIMAX — max intensity
  9:  { stability: 0.65, similarity_boost: 0.78, style: 0.45, use_speaker_boost: false, speed: 1.00 }, // Resolution — calm
  10: { stability: 0.50, similarity_boost: 0.80, style: 0.60, use_speaker_boost: true,  speed: 0.90 }, // Open loop — haunting
};

const DEFAULT_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.80,
  style: 0.65,
  use_speaker_boost: true,
  speed: 0.95,
};

function postToFile(
  endpoint: string,
  body: object,
  outputPath: string,
  timeoutMs = 120_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: endpoint,
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        Accept: "audio/mpeg",
      },
    };

    const timer = setTimeout(() => {
      reject(new Error(`ElevenLabs request timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        let body = "";
        res.on("data", (d: Buffer) => { body += d.toString(); });
        res.on("end", () => {
          reject(new Error(`ElevenLabs HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
        });
        return;
      }

      const file = fs.createWriteStream(outputPath);
      res.pipe(file);
      file.on("finish", () => {
        clearTimeout(timer);
        file.close();
        resolve();
      });
      file.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`ElevenLabs network error: ${err.message}`));
    });

    req.write(bodyStr);
    req.end();
  });
}

// FIX C-02: runConcurrent com limite 2 (não Promise.all irrestrito) + callback SSE
async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

export async function generateAudioWithElevenLabs(
  blocks: ScriptBlock[],
  audioDir: string,
  voiceId: string,
  onBlockDone?: (blockIndex: number, total: number) => void  // FIX A-01: callback SSE
): Promise<string[]> {
  fs.mkdirSync(audioDir, { recursive: true });

  const tasks = blocks.map((block, taskIdx) => async () => {
    const outputPath = path.join(
      audioDir,
      `audio_${String(block.blockNumber).padStart(2, "0")}.mp3`
    );
    const settings = BLOCK_VOICE_SETTINGS[block.blockNumber] ?? DEFAULT_VOICE_SETTINGS;
    const requestBody = {
      text: block.text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: settings.stability,
        similarity_boost: settings.similarity_boost,
        style: settings.style,
        use_speaker_boost: settings.use_speaker_boost,
        speed: settings.speed,
      },
    };

    let attempts = 0;
    let lastError: Error | null = null;
    while (attempts < 3) {
      try {
        await postToFile(
          `/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
          requestBody,
          outputPath
        );
        const stat = fs.statSync(outputPath);
        if (stat.size < 1000) throw new Error(`Audio too small (${stat.size} bytes)`);
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempts++;
        if (attempts < 3) await new Promise((r) => setTimeout(r, 2000 * attempts));
      }
    }
    if (lastError) throw lastError;

    // FIX A-01: notificar progresso por bloco concluído
    if (onBlockDone) onBlockDone(taskIdx, blocks.length);
  });

  // FIX C-02: máx 2 concorrentes — evita rate limit do ElevenLabs
  await runConcurrent(tasks, 2);

  // Return paths in block order
  return blocks.map((b) =>
    path.join(audioDir, `audio_${String(b.blockNumber).padStart(2, "0")}.mp3`)
  );
}
