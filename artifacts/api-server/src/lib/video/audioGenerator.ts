import fs from "fs";
import path from "path";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { ScriptBlock } from "./scriptGenerator.js";

type VoiceType = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export async function generateAudio(
  blocks: ScriptBlock[],
  audioDir: string,
  voice: string
): Promise<string[]> {
  fs.mkdirSync(audioDir, { recursive: true });

  const audioPaths: string[] = [];

  for (const block of blocks) {
    const outputPath = path.join(
      audioDir,
      `audio_${String(block.blockNumber).padStart(2, "0")}.mp3`
    );

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: (voice as VoiceType) || "alloy",
      input: block.text,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    audioPaths.push(outputPath);
  }

  return audioPaths;
}

export function createAudioListFile(audioPaths: string[], listFile: string): void {
  const content = audioPaths
    .map((p) => `file '${p}'`)
    .join("\n");
  fs.writeFileSync(listFile, content);
}
