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
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      } else {
        resolve();
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
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
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    fullAudioPath,
  ]);

  return fullAudioPath;
}

export async function assembleVideo(
  imagePaths: string[],
  fullAudioPath: string,
  outputPath: string,
  secondsPerImage: number = 8
): Promise<void> {
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const imageDir = path.dirname(imagePaths[0]);
  const imagePattern = path.join(imageDir, "img_%02d.png");

  const tempVideoPath = path.join(outputDir, "video_base.mp4");

  const totalImages = imagePaths.length;
  const scaleFilter = "1920:1080";   // W:H for scale/pad filters
  const zoompanSize = "1920x1080";   // WxH for zoompan s= parameter

  await runFFmpeg([
    "-y",
    "-framerate",
    `1/${secondsPerImage}`,
    "-i",
    imagePattern,
    "-vf",
    `scale=${scaleFilter}:force_original_aspect_ratio=decrease,pad=${scaleFilter}:(ow-iw)/2:(oh-ih)/2,setsar=1,zoompan=z='min(zoom+0.0008,1.3)':d=${secondsPerImage * 25}:s=${zoompanSize}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "25",
    "-t",
    String(totalImages * secondsPerImage),
    tempVideoPath,
  ]);

  await runFFmpeg([
    "-y",
    "-i",
    tempVideoPath,
    "-i",
    fullAudioPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    outputPath,
  ]);

  try {
    fs.unlinkSync(tempVideoPath);
  } catch {
    // ignore cleanup errors
  }
}
