import https from "https";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { ScriptBlock } from "./scriptGenerator.js";

function convertToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y", "-i", inputPath,
      "-ar", "44100", "-ac", "1",
      "-b:a", "192k",
      outputPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg convert error: ${stderr.slice(-300)}`));
      else resolve();
    });
    proc.on("error", (e) => reject(e));
  });
}

// For raw PCM data (no WAV header) from Gemini TTS
// mimeType format: "audio/L16;codec=pcm;rate=24000" or similar
function convertToMp3WithPcm(rawPath: string, outputPath: string, mimeType: string): Promise<void> {
  const rateMatch = mimeType.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? rateMatch[1] : "24000";
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y",
      "-f", "s16le",        // signed 16-bit little-endian PCM
      "-ar", sampleRate,
      "-ac", "1",
      "-i", rawPath,
      "-ar", "44100",
      "-b:a", "192k",
      outputPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg PCM convert error: ${stderr.slice(-300)}`));
      else resolve();
    });
    proc.on("error", (e) => reject(e));
  });
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const BASE = "generativelanguage.googleapis.com";

// ─── BLOCK BLUEPRINT (same DarkAgent logic as scriptGenerator) ───────────────
const VISUAL_SEQUENCE = [
  { type: "EXTREME CLOSE-UP / MACRO",      camera: "slow push-in, slight rack focus from foreground to subject" },
  { type: "WIDE AERIAL / ESTABLISHING",    camera: "slow drone pullback revealing massive scale, descending arc" },
  { type: "HUMAN PERSPECTIVE / EYE-LEVEL", camera: "smooth tracking shot following subject, subtle handheld shake" },
  { type: "ABSTRACT CONCEPTUAL / 3D",      camera: "slow orbit around central glowing element, parallax depth" },
  { type: "MACRO DETAIL / TENSION",        camera: "ultra-slow push-in, bokeh collapse toward sharp center point" },
  { type: "WIDE SCALE CONTRAST",           camera: "crane shot rising from ground, tiny figure vs massive backdrop" },
  { type: "HUMAN EMOTIONAL / CLOSE",       camera: "slow dolly forward toward subject face, shallow depth of field" },
  { type: "ABSTRACT DRAMATIC / CLIMAX",    camera: "rapid zoom then freeze, Dutch tilt, unstable then stabilizing" },
  { type: "WIDE RESOLUTION / PULLBACK",    camera: "smooth pullback revealing full scene context, final reveal" },
  { type: "MACRO TEASER / OPEN LOOP",      camera: "slow push-in on detail that doesn't resolve, loop suggestion" },
];

const BLOCK_BLUEPRINT = [
  { role: "HOOK (3 SEGUNDOS)",         instruction: "Start with a shocking statement or brutal contradiction. NOT 'olá' or 'bem-vindos'. Use 1-3 very short punchy sentences." },
  { role: "ABERTURA EXPANSIVA",        instruction: "Why does this matter to YOU right now? Emotional stakes. Leave an open question. Vary sentence length." },
  { role: "CONTEXTO / SETUP",          instruction: "Establish the world. Plant the first open loop — a mystery you won't resolve yet. Foreshadow block 8." },
  { role: "MERGULHO PROFUNDO 1",       instruction: "First layer of depth. End with a micro-cliffhanger — 'but that's not the most surprising part'." },
  { role: "MINI CLIFFHANGER",          instruction: "Reveal something that reframes everything. Short dramatic sentences. Don't resolve — open a new loop." },
  { role: "REVELAÇÃO 1",               instruction: "Scale reveal — show the true magnitude. Use contrast (small vs enormous). Viewer should feel a shift." },
  { role: "PERSPECTIVA HUMANA",        instruction: "Ground technical in human experience. Use 'você', 'imagine', 'agora mesmo enquanto você assiste'." },
  { role: "CLÍMAX EMOCIONAL (70–80%)", instruction: "Highest emotional peak. Short sentences that hit like punches. Close first loop. Open the biggest final question." },
  { role: "RESOLUÇÃO / SÍNTESE",       instruction: "Synthesize all threads. Answer most questions. Leave one major loop deliberately open." },
  { role: "CONCLUSÃO COM LOOP ABERTO", instruction: "End with a question/statement that demands further thought. NO 'gostou do vídeo'. Last sentence should haunt them." },
];

// ─── Gemini TTS voices ────────────────────────────────────────────────────────
export const GEMINI_TTS_VOICES = [
  { id: "gemini-tts:Kore",    name: "Kore",    desc: "Firme, expressivo",    model: "gemini-2.5-flash-preview-tts" },
  { id: "gemini-tts:Charon",  name: "Charon",  desc: "Informativo",          model: "gemini-2.5-flash-preview-tts" },
  { id: "gemini-tts:Fenrir",  name: "Fenrir",  desc: "Entusiasmado",         model: "gemini-2.5-flash-preview-tts" },
  { id: "gemini-tts:Aoede",   name: "Aoede",   desc: "Tranquilo e suave",    model: "gemini-2.5-flash-preview-tts" },
  { id: "gemini-tts:Puck",    name: "Puck",    desc: "Animado",              model: "gemini-2.5-flash-preview-tts" },
  { id: "gemini-tts:Zephyr",  name: "Zephyr",  desc: "Brilhante",            model: "gemini-2.5-flash-preview-tts" },
  { id: "gemini-tts:Orus",    name: "Orus",    desc: "Firme",                model: "gemini-2.5-flash-preview-tts" },
  { id: "gemini-tts:Leda",    name: "Leda",    desc: "Jovem e caloroso",     model: "gemini-2.5-flash-preview-tts" },
];

const BLOCK_EMOTION_PROMPT: Record<number, string> = {
  1:  "Speak with extreme urgency and intensity — this is a shocking hook. Short, punchy, breathless delivery.",
  2:  "Speak with passionate conviction and wonder. Dynamic range — quiet for questions, stronger for declarations.",
  3:  "Steady, authoritative, confident. Plant mystery in your voice — something is coming.",
  4:  "Build momentum. Mix calm explanation with flashes of excitement. Rise slightly on the cliffhanger.",
  5:  "Start normal, accelerate with tension. Short sentences get faster. The listener must feel the ground shift.",
  6:  "Speak with awe and wonder. Dramatic pauses before scale comparisons. Let the magnitude sink in.",
  7:  "Warm, intimate, personal. Speak directly to the listener like a trusted friend.",
  8:  "MAXIMUM INTENSITY — the emotional climax. Short punchy sentences. Every word lands like a punch.",
  9:  "Warm, satisfied, resolved. Let ideas land. The listener should feel smart.",
  10: "Thoughtful and slightly mysterious. Slow final sentence — let the last thought hang in silence.",
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function geminiPost(endpoint: string, body: object, timeoutMs = 120_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: BASE,
      port: 443,
      path: `/v1beta/models/${endpoint}?key=${GEMINI_API_KEY}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };

    const timer = setTimeout(() => reject(new Error(`Gemini timeout: ${endpoint}`)), timeoutMs);

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d: Buffer) => { data += d.toString(); });
      res.on("end", () => {
        clearTimeout(timer);
        try {
          const j = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(`Gemini HTTP ${res.statusCode}: ${JSON.stringify(j).slice(0, 300)}`));
          } else {
            resolve(j);
          }
        } catch {
          reject(new Error(`Gemini parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (err) => { clearTimeout(timer); reject(err); });
    req.write(bodyStr);
    req.end();
  });
}

// ─── SCRIPT GENERATION ───────────────────────────────────────────────────────
export async function generateScriptWithGemini(
  topic: string,
  style: string,
  durationMinutes: number,
  language: string,
  model: string = "gemini-2.5-flash"
): Promise<ScriptBlock[]> {
  const wordsPerBlock = Math.round((durationMinutes * 130) / 10);

  const blocksSpec = BLOCK_BLUEPRINT.map((blueprint, i) => {
    const visual = VISUAL_SEQUENCE[i];
    return `
===BLOCO ${i + 1}===
PAPEL NARRATIVO: ${blueprint.role}
INSTRUÇÃO: ${blueprint.instruction}
TIPO VISUAL OBRIGATÓRIO: ${visual.type}
MOVIMENTO DE CÂMERA: ${visual.camera}
PALAVRAS APROXIMADAS: ${wordsPerBlock}

NARRAÇÃO EM ${language}:
[escreva aqui]

PROMPT DE IMAGEM (inglês, 60-80 palavras, perspectiva ${visual.type}, iluminação, emoção, movimento):
[escreva aqui]
===FIM_BLOCO ${i + 1}===`;
  }).join("\n\n");

  const prompt = `Você é o melhor roteirista de YouTube do mundo para documentários de tecnologia.
Idioma: ${language}. Tom: ${style}. Tema: "${topic}"

REGRAS:
1. NUNCA comece com "Olá", "Bem-vindos", "Hoje vamos"
2. Varie o comprimento das frases: curta. Depois longa. Depois curta.
3. Cada bloco conecta cinematograficamente ao próximo
4. Prompts de imagem NUNCA repetem ângulo do bloco anterior

${blocksSpec}

CHECKLIST:
✅ Bloco 1 começa com choque/contradição?
✅ Cada prompt tem perspectiva + iluminação + emoção?
✅ Há 2+ loops abertos que não fecham completamente?
✅ Clímax emocional está no bloco 8?`;

  const resp = await geminiPost(`${model}:generateContent`, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.8 },
  }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

  const content = resp?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseGeminiScript(content);
}

function parseGeminiScript(content: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];

  for (let i = 1; i <= 10; i++) {
    const pat = new RegExp(
      `===BLOCO ${i}===[\\s\\S]*?NARRAÇÃO[^:]*:\\s*([\\s\\S]*?)PROMPT DE IMAGEM[^:]*:\\s*([\\s\\S]*?)===FIM_BLOCO ${i}===`,
      "i"
    );
    const match = content.match(pat);
    if (match) {
      const text = match[1].trim().replace(/^\[.*?\]\s*/, "").trim();
      const imagePrompt = match[2].trim().replace(/^\[.*?\]\s*/, "").trim();
      const visual = VISUAL_SEQUENCE[i - 1];
      if (text && imagePrompt) {
        blocks.push({ blockNumber: i, text, imagePrompt, cameraMovement: visual.camera, visualType: visual.type });
      }
    }
  }

  if (blocks.length < 5) {
    blocks.length = 0;
    const re = /===BLOCO (\d+)===([\s\S]*?)===FIM_BLOCO \1===/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const bn = parseInt(m[1], 10);
      const bc = m[2];
      const nar = bc.match(/NARRAÇÃO[^:]*:([\s\S]*?)(?:PROMPT|$)/i)?.[1]?.trim() ?? "";
      const prm = bc.match(/PROMPT[^:]*:([\s\S]*?)$/i)?.[1]?.trim() ?? "";
      const visual = VISUAL_SEQUENCE[(bn - 1) % 10];
      if (nar) blocks.push({
        blockNumber: bn,
        text: nar.replace(/^\[.*?\]\s*/, "").trim(),
        imagePrompt: prm.replace(/^\[.*?\]\s*/, "").trim() || `Cinematic ${visual.type} shot, dramatic lighting`,
        cameraMovement: visual.camera,
        visualType: visual.type,
      });
    }
  }

  return blocks.slice(0, 10);
}

// ─── TTS GENERATION ──────────────────────────────────────────────────────────
export async function generateAudioWithGemini(
  blocks: ScriptBlock[],
  audioDir: string,
  voiceEntry: string  // format: "gemini-tts:VoiceName"
): Promise<string[]> {
  fs.mkdirSync(audioDir, { recursive: true });

  const voiceName = voiceEntry.replace("gemini-tts:", "");
  const ttsModel = "gemini-2.5-flash-preview-tts";
  const audioPaths: string[] = [];

  for (const block of blocks) {
    const rawPath = path.join(audioDir, `audio_raw_${String(block.blockNumber).padStart(2, "0")}.wav`);
    const mp3Path = path.join(audioDir, `audio_${String(block.blockNumber).padStart(2, "0")}.mp3`);
    const emotionHint = BLOCK_EMOTION_PROMPT[block.blockNumber] ?? "";

    const textWithHint = emotionHint
      ? `[Narration style: ${emotionHint}]\n\n${block.text}`
      : block.text;

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < 3) {
      try {
        const resp = await geminiPost(`${ttsModel}:generateContent`, {
          contents: [{ parts: [{ text: textWithHint }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        }) as {
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> }
          }>
        };

        const audioPart = resp?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!audioPart?.data) throw new Error(`No audio data returned for block ${block.blockNumber}`);

        // Write raw audio (WAV or PCM) then convert to MP3 for pipeline compatibility
        fs.writeFileSync(rawPath, Buffer.from(audioPart.data, "base64"));
        const stat = fs.statSync(rawPath);
        if (stat.size < 500) throw new Error(`Raw audio too small (${stat.size} bytes)`);

        // Handle raw PCM (no WAV header) vs proper WAV
        const mimeType = audioPart.mimeType ?? "";
        if (mimeType.includes("pcm") && !mimeType.includes("wav")) {
          // Raw PCM — need to wrap with WAV header via ffmpeg pipe
          await convertToMp3WithPcm(rawPath, mp3Path, mimeType);
        } else {
          await convertToMp3(rawPath, mp3Path);
        }

        try { fs.unlinkSync(rawPath); } catch { }
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempts++;
        if (attempts < 3) await new Promise((r) => setTimeout(r, 3000 * attempts));
      }
    }

    if (lastError) throw lastError;
    audioPaths.push(mp3Path);
  }

  return audioPaths;
}

// ─── IMAGE GENERATION ────────────────────────────────────────────────────────
const STYLE_SUFFIXES = [
  "ultra-sharp cinematic 4K, photorealistic, volumetric lighting, deep shadows",
  "IMAX quality, dramatic color grading, film grain, anamorphic lens flare",
  "8K photorealistic, professional color grading, bokeh depth of field, emotional weight",
  "cinematic still, ultra-detailed textures, dramatic lighting, strong visual hierarchy",
  "hyper-realistic render, dark moody atmosphere, single key light, atmospheric haze",
  "award-winning photography, ultra-sharp, rich contrast, emotionally charged",
  "photojournalism style, raw emotional power, decisive moment, ultra-sharp focus",
  "concept art quality, environmental storytelling, dramatic scale, epic composition",
  "technical visualization, neon wireframe accents on dark background, ultra-precise",
  "cinematic wide-angle, leading lines, rule of thirds, perfect exposure, depth",
];

export async function generateImagesWithGemini(
  blocks: ScriptBlock[],
  imagesDir: string,
  style?: string,
  imageModel: string = "gemini-2.5-flash-image"
): Promise<string[]> {
  fs.mkdirSync(imagesDir, { recursive: true });
  const imagePaths: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const suffix = STYLE_SUFFIXES[i % STYLE_SUFFIXES.length];
    const tech = style && /tech|tecnolog|network|data|digital/i.test(style)
      ? "glowing neon accents, dark cinematic background, holographic elements,"
      : "";

    const prompt = [block.imagePrompt, tech, `Camera: ${block.cameraMovement}.`, suffix, "NO text, NO watermark, NO logo"]
      .filter(Boolean).join(" ");

    const outputPath = path.join(imagesDir, `img_${String(block.blockNumber).padStart(2, "0")}.png`);

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < 3) {
      try {
        const resp = await geminiPost(`${imageModel}:generateContent`, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }) as {
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> }
          }>
        };

        const parts = resp?.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
        if (!imgPart?.inlineData?.data) throw new Error(`No image data for block ${block.blockNumber}`);

        fs.writeFileSync(outputPath, Buffer.from(imgPart.inlineData.data, "base64"));
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempts++;
        if (attempts < 3) await new Promise((r) => setTimeout(r, 4000 * attempts));
      }
    }

    if (lastError) throw lastError;
    imagePaths.push(outputPath);
  }

  return imagePaths;
}
