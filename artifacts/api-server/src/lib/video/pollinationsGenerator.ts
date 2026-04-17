import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import type { ScriptBlock } from "./scriptGenerator.js";

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY ?? "";
const BASE_URL = "gen.pollinations.ai";

const IMAGE_MODELS = [
  "flux-realism",
  "flux-cinematic",
  "flux-pro",
  "flux",
  "turbo",
  "sana",
];

const VIDEO_MODELS = [
  "seedance",
  "wan-fast",
  "ltx-2",
  "nova-reel",
];

function fetchToFile(
  urlStr: string,
  outputPath: string,
  timeoutMs: number = 180_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        Authorization: `Bearer ${POLLINATIONS_API_KEY}`,
        Accept: "*/*",
        "User-Agent": "youtube-video-gen/1.0",
      },
    };

    const timer = setTimeout(() => {
      reject(new Error(`Pollinations request timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const req = lib.get(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        clearTimeout(timer);
        const redirectUrl = res.headers.location;
        if (!redirectUrl) {
          reject(new Error("Redirect with no location header"));
          return;
        }
        fetchToFile(redirectUrl, outputPath, timeoutMs).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        clearTimeout(timer);
        let body = "";
        res.on("data", (d: Buffer) => { body += d.toString(); });
        res.on("end", () => {
          reject(new Error(`Pollinations HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
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
      reject(new Error(`Pollinations network error: ${err.message}`));
    });
  });
}

export async function generatePollinationsImages(
  blocks: ScriptBlock[],
  imagesDir: string,
  style?: string,
  imageModel?: string
): Promise<string[]> {
  fs.mkdirSync(imagesDir, { recursive: true });

  const STYLE_SUFFIXES = [
    "ultra-sharp cinematic 4K, photorealistic, volumetric lighting, deep shadows",
    "IMAX quality, dramatic color grading, film grain, anamorphic lens flare",
    "8K photorealistic, professional color grading, bokeh depth of field, emotional weight",
    "cinematic still, ultra-detailed textures, dramatic lighting 3:1 ratio, strong visual hierarchy",
    "hyper-realistic render, dark moody atmosphere, single key light, atmospheric haze",
    "award-winning photography, masterclass composition, ultra-sharp, rich contrast",
    "photojournalism style, raw emotional power, decisive moment, ultra-sharp focus",
    "concept art quality, environmental storytelling, dramatic scale, atmospheric perspective",
    "technical visualization, neon wireframe accents on dark background, ultra-precise",
    "cinematic wide-angle, leading lines, rule of thirds, perfect exposure, depth and dimension",
  ];

  const isTech = style
    ? /tech|tecnolog|explainer|network|data|digital|modern|cinematic documentary/i.test(style)
    : false;

  const imagePaths: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const styleSuffix = STYLE_SUFFIXES[i % STYLE_SUFFIXES.length];
    const techBoost = isTech
      ? "glowing neon accents, dark cinematic background, holographic elements, tech documentary,"
      : "";
    const cameraHint = block.cameraMovement ? `Camera: ${block.cameraMovement}.` : "";

    const fullPrompt = [
      block.imagePrompt,
      techBoost,
      cameraHint,
      styleSuffix,
      "NO text, NO watermark, NO logo",
    ]
      .filter(Boolean)
      .join(" ");

    const model = imageModel || IMAGE_MODELS[i % IMAGE_MODELS.length];
    const encoded = encodeURIComponent(fullPrompt);
    const url = `https://${BASE_URL}/image/${encoded}?width=1536&height=1024&model=${model}&nologo=true`;

    const outputPath = path.join(imagesDir, `img_${String(block.blockNumber).padStart(2, "0")}.jpg`);

    let attempts = 0;
    let lastError: Error | null = null;
    while (attempts < 3) {
      try {
        await fetchToFile(url, outputPath, 90_000);
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempts++;
        if (attempts < 3) {
          await new Promise((r) => setTimeout(r, 3000 * attempts));
        }
      }
    }
    if (lastError) throw lastError;

    imagePaths.push(outputPath);
  }

  return imagePaths;
}

export async function generatePollinationsVideoClips(
  blocks: ScriptBlock[],
  audioPaths: string[],
  clipsDir: string,
  videoModel?: string
): Promise<string[]> {
  fs.mkdirSync(clipsDir, { recursive: true });

  const clipPaths: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    const videoPrompt = [
      block.imagePrompt,
      block.cameraMovement ? `Camera movement: ${block.cameraMovement}.` : "",
      "Cinematic, smooth motion, no text, no logo, professional grade",
    ]
      .filter(Boolean)
      .join(" ");

    const model = videoModel || VIDEO_MODELS[i % VIDEO_MODELS.length];
    const encoded = encodeURIComponent(videoPrompt);
    const url = `https://${BASE_URL}/video/${encoded}?model=${model}&duration=5&aspectRatio=16:9`;

    const outputPath = path.join(clipsDir, `clip_${String(block.blockNumber).padStart(2, "0")}.mp4`);

    let attempts = 0;
    let lastError: Error | null = null;
    while (attempts < 2) {
      try {
        await fetchToFile(url, outputPath, 180_000);
        const stat = fs.statSync(outputPath);
        if (stat.size < 10_000) {
          throw new Error(`Clip too small (${stat.size} bytes), likely an error response`);
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempts++;
        if (attempts < 2) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }

    clipPaths.push(lastError ? `__FAILED__:${block.blockNumber}` : outputPath);
  }

  return clipPaths;
}
