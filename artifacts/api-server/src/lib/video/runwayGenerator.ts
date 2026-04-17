import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import type { ScriptBlock } from "./scriptGenerator.js";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";

function runwayFetch(endpoint: string, options: RequestInit): Promise<Response> {
  return fetch(`${RUNWAY_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${RUNWAY_API_KEY}`,
      "Content-Type": "application/json",
      "X-Runway-Version": RUNWAY_VERSION,
      ...(options.headers as Record<string, string>),
    },
  });
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith("https") ? https : http;
    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        downloadFile(response.headers.location!, destPath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    }).on("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTask(taskId: string, timeoutMs = 300000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(5000);
    const resp = await runwayFetch(`/tasks/${taskId}`, { method: "GET" });
    const data = await resp.json() as {
      status: string;
      output?: string[];
      failure?: string;
      failureCode?: string;
    };

    if (data.status === "SUCCEEDED") {
      const videoUrl = data.output?.[0];
      if (!videoUrl) throw new Error("Runway task succeeded but no output URL");
      return videoUrl;
    }

    if (data.status === "FAILED") {
      throw new Error(`Runway task failed: ${data.failure ?? data.failureCode ?? "unknown"}`);
    }
  }
  throw new Error("Runway task timed out after 5 minutes");
}

export async function generateVideoClips(
  blocks: ScriptBlock[],
  imagePaths: string[],
  clipsDir: string,
  secondsPerClip: number = 5
): Promise<string[]> {
  if (!RUNWAY_API_KEY) {
    throw new Error("RUNWAY_API_KEY não configurado");
  }

  fs.mkdirSync(clipsDir, { recursive: true });

  const clipPaths: string[] = [];
  const duration = secondsPerClip >= 10 ? 10 : 5;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const imagePath = imagePaths[i];
    const clipPath = path.join(clipsDir, `clip_${String(i + 1).padStart(2, "0")}.mp4`);

    const imageBuffer = fs.readFileSync(imagePath);
    const b64 = imageBuffer.toString("base64");
    const dataUri = `data:image/png;base64,${b64}`;

    const motionPrompts = [
      "smooth cinematic camera dolly forward, slow zoom in",
      "elegant pan left to right, gentle camera drift",
      "slow zoom out revealing the scene, cinematic",
      "orbit camera movement, parallax depth effect",
      "push in close on subject, bokeh background blur",
      "tilt up from ground to sky, dramatic reveal",
      "tracking shot, smooth horizontal movement",
      "zoom in slowly with subtle handheld motion",
      "cinematic crane shot, rising movement",
      "wide establishing shot with slow push in",
    ];
    const motionHint = motionPrompts[i % motionPrompts.length];
    const promptText = `${motionHint}. ${block.imagePrompt.slice(0, 200)}`;

    const body = {
      model: "gen4_turbo",
      promptImage: dataUri,
      promptText,
      ratio: "1280:720",
      duration,
    };

    const resp = await runwayFetch("/image_to_video", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const taskData = await resp.json() as { id?: string; error?: string; message?: string };

    if (!taskData.id) {
      throw new Error(
        `Runway não retornou task ID para bloco ${block.blockNumber}: ${taskData.error ?? taskData.message ?? JSON.stringify(taskData).slice(0, 200)}`
      );
    }

    const videoUrl = await pollTask(taskData.id);
    await downloadFile(videoUrl, clipPath);
    clipPaths.push(clipPath);
  }

  return clipPaths;
}
