import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// ─── PLATFORM SPECS ──────────────────────────────────────────────────────────
// Based on 2026 social media standards: 1080p H.264 MP4 @ 30fps
export interface PlatformSpec {
  w: number;
  h: number;
  fps: number;
  label: string;
  bitrate: string;
}

export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  "youtube":           { w: 1920, h: 1080, fps: 30, label: "YouTube 16:9",                bitrate: "8000k" },
  "reels":             { w: 1080, h: 1920, fps: 30, label: "Instagram Reels / Stories 9:16", bitrate: "8000k" },
  "tiktok":            { w: 1080, h: 1920, fps: 30, label: "TikTok 9:16",                 bitrate: "8000k" },
  "shorts":            { w: 1080, h: 1920, fps: 30, label: "YouTube Shorts 9:16",          bitrate: "8000k" },
  "instagram-square":  { w: 1080, h: 1080, fps: 30, label: "Instagram Square 1:1",         bitrate: "6000k" },
  "instagram-vertical":{ w: 1080, h: 1350, fps: 30, label: "Instagram Vertical 4:5",       bitrate: "7000k" },
};

function getPlatformSpec(platform?: string): PlatformSpec {
  return PLATFORM_SPECS[platform ?? "youtube"] ?? PLATFORM_SPECS["youtube"];
}

// ─── FFMPEG HELPERS ───────────────────────────────────────────────────────────
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-800)}`));
      } else {
        resolve();
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

function runFFprobe(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) resolve(30);
      else {
        const duration = parseFloat(stdout.trim());
        resolve(isNaN(duration) ? 30 : duration);
      }
    });
    proc.on("error", () => resolve(30));
  });
}

export async function getAudioDurations(audioPaths: string[]): Promise<number[]> {
  const durations: number[] = [];
  for (const p of audioPaths) {
    durations.push(await runFFprobe(p));
  }
  return durations;
}

// ─── SCALE + PAD FILTER ───────────────────────────────────────────────────────
function scaleFilter(w: number, h: number): string {
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
}

// ─── ZOOMPAN VARIANTS ─────────────────────────────────────────────────────────
// 10 cinematic motion variants; s=WxH adapts to platform
function makeZoompanVariants(w: number, h: number, fps: number) {
  const s = `${w}x${h}`;
  return [
    (d: number) => `zoompan=z='min(zoom+0.0010,1.4)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.0010))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='min(zoom+0.0008,1.3)':x='iw/2-(iw/zoom/2)+sin(on/${fps})*20':y='ih/2-(ih/zoom/2)':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='min(zoom+0.0010,1.35)':x='0':y='0':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='min(zoom+0.0008,1.3)':x='iw-iw/zoom':y='ih/2-(ih/zoom/2)':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='min(zoom+0.0012,1.45)':x='iw/2-(iw/zoom/2)':y='0':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='1.3':x='iw/2-(iw/zoom/2)+cos(on/${fps})*15':y='ih/2-(ih/zoom/2)':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='min(zoom+0.0006,1.25)':x='iw-(iw/zoom)':y='ih-(ih/zoom)':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='if(lte(zoom,1.0),1.4,max(1.001,zoom-0.0012))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${s}`,
    (d: number) => `zoompan=z='min(zoom+0.0009,1.35)':x='iw/2-(iw/zoom/2)':y='ih-(ih/zoom)':d=${d}:s=${s}`,
  ];
}

// ─── MERGE AUDIOS ─────────────────────────────────────────────────────────────
export async function mergeAudios(
  audioPaths: string[],
  outputDir: string
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });

  const listFile = path.join(outputDir, "list.txt");
  fs.writeFileSync(listFile, audioPaths.map((p) => `file '${p}'`).join("\n"));

  const fullAudioPath = path.join(outputDir, "audio_full.mp3");

  await runFFmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listFile,
    "-c", "copy",
    fullAudioPath,
  ]);

  return fullAudioPath;
}

// ─── ASSEMBLE FROM VIDEO CLIPS ────────────────────────────────────────────────
export async function assembleFromClips(
  clipPaths: string[],
  fullAudioPath: string,
  outputPath: string,
  platform?: string
): Promise<void> {
  const spec = getPlatformSpec(platform);
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const listFile = path.join(outputDir, "clips_list.txt");
  fs.writeFileSync(listFile, clipPaths.map((p) => `file '${p}'`).join("\n"));

  const tempVideoPath = path.join(outputDir, "video_concat.mp4");

  await runFFmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listFile,
    "-vf", scaleFilter(spec.w, spec.h),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-r", String(spec.fps),
    tempVideoPath,
  ]);

  await runFFmpeg([
    "-y",
    "-i", tempVideoPath,
    "-i", fullAudioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-map", "0:v:0",
    "-map", "1:a:0",
    outputPath,
  ]);

  try { fs.unlinkSync(tempVideoPath); } catch { }
}

// ─── ASSEMBLE FROM IMAGES (Ken Burns / Zoompan) ───────────────────────────────
export async function assembleVideo(
  imagePaths: string[],
  audioPaths: string[],
  fullAudioPath: string,
  outputPath: string,
  platform?: string,
): Promise<void> {
  const spec = getPlatformSpec(platform);
  const { w, h, fps } = spec;

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const zoompanVariants = makeZoompanVariants(w, h, fps);
  const n = imagePaths.length;
  const tempClipPaths: string[] = [];

  for (let i = 0; i < n; i++) {
    const imgPath = imagePaths[i];
    const clipPath = path.join(outputDir, `img_clip_${String(i).padStart(2, "0")}.mp4`);

    const blockDuration = await runFFprobe(audioPaths[i]);
    const d = Math.ceil(blockDuration * fps);
    const variant = zoompanVariants[i % zoompanVariants.length](d);

    await runFFmpeg([
      "-y",
      "-loop", "1",
      "-i", imgPath,
      "-vf", `${scaleFilter(w, h)},${variant}`,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-r", String(fps),
      "-t", String(blockDuration),
      clipPath,
    ]);

    tempClipPaths.push(clipPath);
  }

  const listFile = path.join(outputDir, "img_clips_list.txt");
  fs.writeFileSync(listFile, tempClipPaths.map((p) => `file '${p}'`).join("\n"));

  const tempVideoPath = path.join(outputDir, "video_base.mp4");

  await runFFmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listFile,
    "-c", "copy",
    tempVideoPath,
  ]);

  await runFFmpeg([
    "-y",
    "-i", tempVideoPath,
    "-i", fullAudioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-map", "0:v:0",
    "-map", "1:a:0",
    outputPath,
  ]);

  for (const p of tempClipPaths) {
    try { fs.unlinkSync(p); } catch { }
  }
  try { fs.unlinkSync(tempVideoPath); } catch { }
}

// ─── BURN SUBTITLES INTO VIDEO ────────────────────────────────────────────────
// Takes a completed video and burns ASS subtitles into it.
// Uses a second libx264 pass — the ASS filter renders text directly into frames.
export async function burnSubtitles(
  inputVideoPath: string,
  assFilePath: string,
  outputPath: string,
): Promise<void> {
  // FFmpeg ass filter requires POSIX path with escaped colons/backslashes
  const normalized = assFilePath.replace(/\\/g, "/");
  // On Linux this is simply the path; escape colons just in case (Windows drives)
  const escaped = normalized.replace(/:/g, "\\:");

  await runFFmpeg([
    "-y",
    "-i", inputVideoPath,
    "-vf", `ass='${escaped}'`,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "20",
    "-c:a", "copy",
    outputPath,
  ]);
}
