import fs from "fs";
import path from "path";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { ScriptBlock } from "./scriptGenerator.js";

export async function generateImages(
  blocks: ScriptBlock[],
  imagesDir: string
): Promise<string[]> {
  fs.mkdirSync(imagesDir, { recursive: true });

  const imagePaths: string[] = [];

  for (const block of blocks) {
    const enhancedPrompt = `${block.imagePrompt}, cinematic photography, dramatic lighting, high contrast, 4K ultra detailed, professional composition`;

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: enhancedPrompt,
      size: "1024x1024",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(
        `No image data returned for block ${block.blockNumber}`
      );
    }

    const outputPath = path.join(
      imagesDir,
      `img_${String(block.blockNumber).padStart(2, "0")}.png`
    );
    fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));
    imagePaths.push(outputPath);
  }

  return imagePaths;
}
