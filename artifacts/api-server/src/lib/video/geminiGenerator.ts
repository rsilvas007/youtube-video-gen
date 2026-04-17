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

// Wrapper with automatic retry for transient Gemini errors (503, 429, network)
async function geminiPostWithRetry(
  endpoint: string,
  body: object,
  timeoutMs = 120_000,
  maxAttempts = 5
): Promise<unknown> {
  let lastError: Error = new Error("Unknown error");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await geminiPost(endpoint, body, timeoutMs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const is503 = msg.includes("503");
      const is429 = msg.includes("429");
      const isTimeout = msg.includes("timeout");
      const isRetryable = is503 || is429 || isTimeout;

      if (!isRetryable || attempt === maxAttempts) throw lastError;

      // 503 overloaded: 10s, 20s, 30s, 40s
      // 429 quota:      30s, 60s, 90s, 120s
      const baseDelay = is429 ? 30_000 : 10_000;
      const delay = baseDelay * attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ─── SCRIPT GENERATION ───────────────────────────────────────────────────────
export async function generateScriptWithGemini(
  topic: string,
  style: string,
  durationMinutes: number,
  language: string,
  model: string = "gemini-2.5-flash",
  blockCount: number = 10
): Promise<ScriptBlock[]> {
  const n = Math.min(blockCount, BLOCK_BLUEPRINT.length);
  const wordsPerBlock = Math.round((durationMinutes * 130) / n);

  const blocksSpec = BLOCK_BLUEPRINT.slice(0, n).map((blueprint, i) => {
    const visual = VISUAL_SEQUENCE[i % VISUAL_SEQUENCE.length];
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

  const resp = await geminiPostWithRetry(`${model}:generateContent`, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.8 },
  }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

  const content = resp?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseGeminiScript(content, n);
}

function parseGeminiScript(content: string, n: number = 10): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];

  for (let i = 1; i <= n; i++) {
    const pat = new RegExp(
      `===BLOCO ${i}===[\\s\\S]*?NARRAÇÃO[^:]*:\\s*([\\s\\S]*?)PROMPT DE IMAGEM[^:]*:\\s*([\\s\\S]*?)===FIM_BLOCO ${i}===`,
      "i"
    );
    const match = content.match(pat);
    if (match) {
      const text = match[1].trim().replace(/^\[.*?\]\s*/, "").trim();
      const imagePrompt = match[2].trim().replace(/^\[.*?\]\s*/, "").trim();
      const visual = VISUAL_SEQUENCE[(i - 1) % VISUAL_SEQUENCE.length];
      if (text && imagePrompt) {
        blocks.push({ blockNumber: i, text, imagePrompt, cameraMovement: visual.camera, visualType: visual.type });
      }
    }
  }

  // Fallback: regex scan if fewer than half the expected blocks were found
  if (blocks.length < Math.ceil(n / 2)) {
    blocks.length = 0;
    const re = /===BLOCO (\d+)===([\s\S]*?)===FIM_BLOCO \1===/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const bn = parseInt(m[1], 10);
      const bc = m[2];
      const nar = bc.match(/NARRAÇÃO[^:]*:([\s\S]*?)(?:PROMPT|$)/i)?.[1]?.trim() ?? "";
      const prm = bc.match(/PROMPT[^:]*:([\s\S]*?)$/i)?.[1]?.trim() ?? "";
      const visual = VISUAL_SEQUENCE[(bn - 1) % VISUAL_SEQUENCE.length];
      if (nar) blocks.push({
        blockNumber: bn,
        text: nar.replace(/^\[.*?\]\s*/, "").trim(),
        imagePrompt: prm.replace(/^\[.*?\]\s*/, "").trim() || `Cinematic ${visual.type} shot, dramatic lighting`,
        cameraMovement: visual.camera,
        visualType: visual.type,
      });
    }
  }

  return blocks.slice(0, n);
}

// ─── TTS GENERATION ──────────────────────────────────────────────────────────
// Voice prefix → TTS model mapping:
//   gemini-tts:VoiceName   → gemini-2.5-flash-preview-tts
//   gemini-3.1-tts:VoiceName → gemini-3.1-flash-tts-preview

// Run tasks with a max concurrency limit
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

export async function generateAudioWithGemini(
  blocks: ScriptBlock[],
  audioDir: string,
  voiceEntry: string
): Promise<string[]> {
  fs.mkdirSync(audioDir, { recursive: true });

  let voiceName: string;
  let ttsModel: string;

  if (voiceEntry.startsWith("gemini-3.1-tts:")) {
    voiceName = voiceEntry.replace("gemini-3.1-tts:", "");
    ttsModel = "gemini-3.1-flash-tts-preview";
  } else {
    voiceName = voiceEntry.replace("gemini-tts:", "");
    ttsModel = "gemini-2.5-flash-preview-tts";
  }

  // Generate all audio blocks in parallel (max 2 concurrent to respect rate limits)
  const tasks = blocks.map((block) => async (): Promise<string> => {
    const rawPath = path.join(audioDir, `audio_raw_${String(block.blockNumber).padStart(2, "0")}.wav`);
    const mp3Path = path.join(audioDir, `audio_${String(block.blockNumber).padStart(2, "0")}.mp3`);
    const emotionHint = BLOCK_EMOTION_PROMPT[block.blockNumber] ?? "";
    const textWithHint = emotionHint
      ? `[Narration style: ${emotionHint}]\n\n${block.text}`
      : block.text;

    const resp = await geminiPostWithRetry(`${ttsModel}:generateContent`, {
      contents: [{ parts: [{ text: textWithHint }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> }
      }>
    };

    const audioPart = resp?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!audioPart?.data) throw new Error(`No audio data for block ${block.blockNumber}`);

    fs.writeFileSync(rawPath, Buffer.from(audioPart.data, "base64"));
    const stat = fs.statSync(rawPath);
    if (stat.size < 500) throw new Error(`Raw audio too small (${stat.size} bytes)`);

    const mimeType = audioPart.mimeType ?? "";
    if (mimeType.includes("pcm") && !mimeType.includes("wav")) {
      await convertToMp3WithPcm(rawPath, mp3Path, mimeType);
    } else {
      await convertToMp3(rawPath, mp3Path);
    }
    try { fs.unlinkSync(rawPath); } catch { }
    return mp3Path;
  });

  const mp3Paths = await runConcurrent(tasks, 2);
  // Return in block order
  return blocks.map((b) =>
    path.join(audioDir, `audio_${String(b.blockNumber).padStart(2, "0")}.mp3`)
  );
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
  const tech = style && /tech|tecnolog|network|data|digital/i.test(style)
    ? "glowing neon accents, dark cinematic background, holographic elements,"
    : "";

  // Generate all images in parallel (max 2 concurrent — Gemini image has strict rate limits)
  await runConcurrent(
    blocks.map((block, i) => async () => {
      const suffix = STYLE_SUFFIXES[i % STYLE_SUFFIXES.length];
      const prompt = [block.imagePrompt, tech, `Camera: ${block.cameraMovement}.`, suffix, "NO text, NO watermark, NO logo"]
        .filter(Boolean).join(" ");
      const outputPath = path.join(imagesDir, `img_${String(block.blockNumber).padStart(2, "0")}.png`);

      const resp = await geminiPostWithRetry(`${imageModel}:generateContent`, {
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
    }),
    2
  );

  return blocks.map((b) =>
    path.join(imagesDir, `img_${String(b.blockNumber).padStart(2, "0")}.png`)
  );
}

// ─── CUSTOM SCRIPT PARSER ────────────────────────────────────────────────────
// Accepts a free-form user script and uses Gemini to split it into 10 blocks
// with appropriate image prompts for each block.
export async function parseCustomScriptWithGemini(
  customScript: string,
  topic: string,
  style: string,
  language: string,
  model: string = "gemini-2.5-flash"
): Promise<ScriptBlock[]> {
  const prompt = `You are an expert video producer and prompt engineer.

The user has written their own narration script for a YouTube video about: "${topic}" (style: ${style}, language: ${language}).

YOUR TASK: Split the script into exactly 10 narrative blocks and generate a cinematic image prompt for each block.

RULES:
1. Split the script naturally at paragraph or sentence boundaries — do NOT cut words mid-sentence
2. Each block should be roughly equal length but can vary based on natural breaks
3. If the script has fewer than 10 natural sections, split longer sections further
4. If the script has more than 10 sections, merge shorter ones
5. For each block's image prompt: write a cinematic, photorealistic description (60-80 words) with specific camera angle, lighting, color palette, and mood — end with "ultra-sharp 8K, photorealistic, no text"
6. NEVER repeat the same camera angle in consecutive blocks

OUTPUT FORMAT — return ONLY this, no extra text:
===BLOCO 1===
NARRAÇÃO: [block 1 text, copied exactly from the script]
PROMPT: [cinematic image prompt for block 1]
===FIM_BLOCO 1===

===BLOCO 2===
NARRAÇÃO: [block 2 text]
PROMPT: [image prompt for block 2]
===FIM_BLOCO 2===

... (continue for all 10 blocks)

THE USER'S SCRIPT:
${customScript}`;

  const resp = await geminiPostWithRetry(`${model}:generateContent`, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
  }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

  const content = resp?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const blocks: ScriptBlock[] = [];
  const re = /===BLOCO (\d+)===([\s\S]*?)===FIM_BLOCO \1===/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const bn = parseInt(m[1], 10);
    const bc = m[2];
    const narMatch = bc.match(/NARRAÇÃO:\s*([\s\S]*?)(?:PROMPT:|$)/i);
    const prmMatch = bc.match(/PROMPT:\s*([\s\S]*?)$/i);
    const text = narMatch?.[1]?.trim() ?? "";
    const imagePrompt = prmMatch?.[1]?.trim() ?? `Cinematic shot, dramatic lighting, ${style} mood, ultra-sharp 8K`;
    const visual = VISUAL_SEQUENCE[(bn - 1) % 10];
    if (text) {
      blocks.push({
        blockNumber: bn,
        text,
        imagePrompt,
        cameraMovement: visual.camera,
        visualType: visual.type,
      });
    }
  }

  // If parsing failed, do a simple word-count split
  if (blocks.length < 3) {
    const words = customScript.trim().split(/\s+/);
    const chunkSize = Math.ceil(words.length / 10);
    for (let i = 0; i < 10; i++) {
      const chunk = words.slice(i * chunkSize, (i + 1) * chunkSize).join(" ");
      if (chunk.trim()) {
        const visual = VISUAL_SEQUENCE[i];
        blocks.push({
          blockNumber: i + 1,
          text: chunk,
          imagePrompt: `Cinematic ${visual.type} shot, ${style} atmosphere, dramatic lighting, ultra-sharp 8K, photorealistic, no text`,
          cameraMovement: visual.camera,
          visualType: visual.type,
        });
      }
    }
  }

  return blocks;
}

// ─── IMAGE PROMPT ENHANCEMENT ────────────────────────────────────────────────
// Uses Gemini to improve all 10 image prompts before sending to image generators.
// Results in dramatically better cinematic imagery.
export async function enhanceImagePromptsWithGemini(
  blocks: ScriptBlock[],
  style: string,
  topic: string,
  model: string = "gemini-2.5-flash"
): Promise<ScriptBlock[]> {
  const promptsText = blocks.map((b, i) => `BLOCO ${i + 1} (${b.visualType}):\n${b.imagePrompt}`).join("\n\n");

  const enhancePrompt = `You are an elite AI cinematographer and prompt engineer specializing in photorealistic AI image generation.

TOPIC: "${topic}" | STYLE: ${style}

TASK: Rewrite each of the 10 image prompts below to be dramatically more cinematic, specific, and visually powerful. Each improved prompt must:
1. Include specific camera position (macro, aerial, eye-level, Dutch tilt, etc.)
2. Include precise lighting (golden hour, neon, volumetric, chiaroscuro, etc.)
3. Include color palette (deep crimson, teal/orange, monochromatic blues, etc.)
4. Include atmosphere/mood (thick fog, dust particles, heat haze, rain, etc.)
5. Include subject detail (textures, materials, scale comparison)
6. End with: "ultra-sharp 8K, photorealistic, no text, no watermarks"
7. NEVER repeat the same camera angle as the previous block
8. Keep under 90 words per prompt

OUTPUT FORMAT — return ONLY this structure:
ENHANCED_1: [improved prompt for block 1]
ENHANCED_2: [improved prompt for block 2]
...
ENHANCED_10: [improved prompt for block 10]

ORIGINAL PROMPTS TO IMPROVE:
${promptsText}`;

  try {
    const resp = await geminiPostWithRetry(`${model}:generateContent`, {
      contents: [{ parts: [{ text: enhancePrompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
    }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

    const content = resp?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const enhanced = [...blocks];

    for (let i = 0; i < blocks.length; i++) {
      const match = content.match(new RegExp(`ENHANCED_${i + 1}:\\s*([^\\n]+(?:\\n(?!ENHANCED_\\d)[^\\n]+)*)`, "i"));
      if (match) {
        const improved = match[1].trim();
        if (improved.length > 20) {
          enhanced[i] = { ...blocks[i], imagePrompt: improved };
        }
      }
    }

    return enhanced;
  } catch {
    // If enhancement fails, return original blocks unchanged
    return blocks;
  }
}

// ─── YOUTUBE METADATA GENERATION ─────────────────────────────────────────────
export interface YouTubeMetadata {
  titles: string[];
  description: string;
  tags: string[];
  hashtags: string[];
}

export async function generateYouTubeMetadataWithGemini(
  blocks: ScriptBlock[],
  topic: string,
  style: string,
  language: string,
  model: string = "gemini-2.5-flash"
): Promise<YouTubeMetadata> {
  const scriptSummary = blocks.slice(0, 5).map((b) => b.text.slice(0, 200)).join(" ");

  const metaPrompt = `You are the world's best YouTube SEO and content strategist, specializing in viral documentary content.

VIDEO TOPIC: "${topic}"
STYLE: ${style}
LANGUAGE: ${language}
SCRIPT PREVIEW: "${scriptSummary}"

Generate COMPLETE YouTube metadata that maximizes clicks, watch time, and algorithm reach.

RETURN ONLY valid JSON with this EXACT structure:
{
  "titles": [
    "TITLE 1 — shocking hook, under 60 chars, no clickbait lies",
    "TITLE 2 — curiosity gap format",
    "TITLE 3 — number-based format",
    "TITLE 4 — question format",
    "TITLE 5 — secret/hidden/truth format"
  ],
  "description": "Complete YouTube description in ${language}, 900-1200 characters. Start with the most compelling hook (no 'bem-vindos'). Include: what the video reveals, why it matters NOW, timestamps placeholder, call to action, channel info. End with relevant keywords naturally embedded.",
  "tags": ["tag1", "tag2", "tag3"...] (25-30 highly specific tags in ${language} mixing broad and niche),
  "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3", "#Hashtag4", "#Hashtag5", "#Hashtag6"]
}`;

  const defaultMeta: YouTubeMetadata = {
    titles: [`${topic} — O Que Ninguém Te Contou`, `A Verdade Chocante Sobre ${topic}`, topic],
    description: `Neste vídeo revelamos tudo sobre ${topic}. ${scriptSummary.slice(0, 300)}`,
    tags: [topic, style, "documentário", "YouTube"],
    hashtags: [`#${topic.replace(/\s+/g, "")}`, "#Documentário", "#YouTube"],
  };

  try {
    const resp = await geminiPostWithRetry(`${model}:generateContent`, {
      contents: [{ parts: [{ text: metaPrompt }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.8, responseMimeType: "application/json" },
    }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

    const text = resp?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(clean) as Partial<YouTubeMetadata>;

    return {
      titles: Array.isArray(parsed.titles) && parsed.titles.length > 0 ? parsed.titles : defaultMeta.titles,
      description: typeof parsed.description === "string" && parsed.description.length > 50 ? parsed.description : defaultMeta.description,
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : defaultMeta.tags,
      hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0 ? parsed.hashtags : defaultMeta.hashtags,
    };
  } catch {
    return defaultMeta;
  }
}
