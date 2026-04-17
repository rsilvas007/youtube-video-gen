import { spawn } from "child_process";
import fs from "fs";
import path from "path";

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

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
      if (code !== 0) {
        resolve(30);
      } else {
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
    const dur = await runFFprobe(p);
    durations.push(dur);
  }
  return durations;
}

export async function mergeAudios(
  audioPaths: string[],
  outputDir: string
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });

  const listFile = path.join(outputDir, "list.txt");
  const content = audioPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(listFile, content);

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

export async function assembleFromClips(
  clipPaths: string[],
  fullAudioPath: string,
  outputPath: string
): Promise<void> {
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const listFile = path.join(outputDir, "clips_list.txt");
  const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(listFile, listContent);

  const tempVideoPath = path.join(outputDir, "video_concat.mp4");

  await runFFmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listFile,
    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-r", "24",
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

export async function assembleVideo(
  imagePaths: string[],
  audioPaths: string[],
  fullAudioPath: string,
  outputPath: string,
): Promise<void> {
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const n = imagePaths.length;
  const fps = 25;

  const zoompanVariants = [
    (d: number) => `zoompan=z='min(zoom+0.0010,1.4)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.0010))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='min(zoom+0.0008,1.3)':x='iw/2-(iw/zoom/2)+sin(on/${fps})*20':y='ih/2-(ih/zoom/2)':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='min(zoom+0.0010,1.35)':x='0':y='0':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='min(zoom+0.0008,1.3)':x='iw-iw/zoom':y='ih/2-(ih/zoom/2)':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='min(zoom+0.0012,1.45)':x='iw/2-(iw/zoom/2)':y='0':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='1.3':x='iw/2-(iw/zoom/2)+cos(on/${fps})*15':y='ih/2-(ih/zoom/2)':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='min(zoom+0.0006,1.25)':x='iw-(iw/zoom)':y='ih-(ih/zoom)':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='if(lte(zoom,1.0),1.4,max(1.001,zoom-0.0012))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=1280x720`,
    (d: number) => `zoompan=z='min(zoom+0.0009,1.35)':x='iw/2-(iw/zoom/2)':y='ih-(ih/zoom)':d=${d}:s=1280x720`,
  ];

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
      "-vf", `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,${variant}`,
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
