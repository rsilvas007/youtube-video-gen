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

    // Use chat completions with audio output modality (supported by Replit AI proxy)
    const response = await openai.chat.completions.create({
      model: "gpt-audio-mini",
      modalities: ["text", "audio"],
      audio: {
        voice: (voice as VoiceType) || "alloy",
        format: "mp3",
      },
      messages: [
        {
          role: "system",
          content:
            "You are a professional narrator. Read the following text naturally and expressively, exactly as provided. Do not add any commentary.",
        },
        {
          role: "user",
          content: block.text,
        },
      ],
    });

    const audioData = (response.choices[0]?.message as { audio?: { data?: string } })?.audio?.data;
    if (!audioData) {
      throw new Error(
        `No audio data returned for block ${block.blockNumber}`
      );
    }

    fs.writeFileSync(outputPath, Buffer.from(audioData, "base64"));
    audioPaths.push(outputPath);
  }

  return audioPaths;
}
