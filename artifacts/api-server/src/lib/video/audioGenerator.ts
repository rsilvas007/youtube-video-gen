import fs from "fs";
import path from "path";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { ScriptBlock } from "./scriptGenerator.js";

const BLOCK_EMOTION_INSTRUCTIONS: Record<number, string> = {
  1: "You are an intense, gripping documentary narrator. Speak with urgency and shock — like you're revealing something that changes everything. Short dramatic pauses between sentences. Voice is low, commanding, slightly breathless. This is the HOOK that must stop someone from scrolling.",
  2: "You are a passionate documentary narrator building emotional stakes. Your voice rises with conviction and wonder. Use dynamic range — quiet and intimate for questions, stronger for declarations. The listener must feel personally connected to this topic.",
  3: "You are a confident documentary narrator establishing a world. Steady pacing, authoritative but engaging. Plant mystery in your voice — something is coming that the listener doesn't know yet. Foreshadow without revealing.",
  4: "You are a captivating educator revealing fascinating depth. Build momentum through the explanation. End with a subtle vocal rise on the cliffhanger moment — your voice signals 'but wait, there's more'. Mix calm explanation with flashes of excitement.",
  5: "You are a master storyteller delivering a plot twist. Start normal pace, then accelerate as tension builds. Short sentences get shorter, faster. Your voice carries tension and urgency. The listener must feel the ground shift.",
  6: "You are a documentary narrator revealing mind-bending scale. Voice carries awe and wonder. Use dramatic pauses before scale comparisons. Let the magnitude sink in with your pacing. The listener should feel small and amazed.",
  7: "You are a warm, empathetic narrator making complex ideas personal. Speak directly to the listener — intimate, like a trusted friend sharing something profound. Use 'you' with genuine connection in your voice. Slower, more personal.",
  8: "You are a documentary narrator at the EMOTIONAL CLIMAX. This is the most important moment. Short punchy sentences delivered with maximum impact. Your voice is at peak intensity — not shouting, but every word lands like a punch. This is the revelation they've been waiting for.",
  9: "You are a narrator bringing resolution and synthesis. Voice is warm, satisfied, like a teacher whose students finally understand. Steady pacing, generous with pauses to let ideas land. The listener should feel smart and complete.",
  10: "You are a narrator leaving a haunting final thought. Voice is thoughtful, slightly mysterious. The last sentence should be delivered slowly with a trailing quality — as if the thought continues beyond the words. Leave silence hanging in the air.",
};

const DEFAULT_INSTRUCTION =
  "You are an expressive, dynamic documentary narrator for a YouTube channel. Speak with energy, vary your pacing, use dramatic pauses for emphasis. Make every sentence engaging. Avoid monotone delivery at all costs.";

export async function generateAudio(
  blocks: ScriptBlock[],
  audioDir: string,
  voice: string
): Promise<string[]> {
  fs.mkdirSync(audioDir, { recursive: true });

  const validVoices = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"];
  const safeVoice = validVoices.includes(voice) ? voice : "onyx";

  const audioPaths: string[] = [];

  for (const block of blocks) {
    const outputPath = path.join(
      audioDir,
      `audio_${String(block.blockNumber).padStart(2, "0")}.mp3`
    );

    const instructions = BLOCK_EMOTION_INSTRUCTIONS[block.blockNumber] ?? DEFAULT_INSTRUCTION;

    const mp3Response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: safeVoice as "alloy" | "ash" | "ballad" | "coral" | "echo" | "fable" | "onyx" | "nova" | "sage" | "shimmer" | "verse",
      input: block.text,
      instructions,
      response_format: "mp3",
    } as Parameters<typeof openai.audio.speech.create>[0]);

    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    audioPaths.push(outputPath);
  }

  return audioPaths;
}
