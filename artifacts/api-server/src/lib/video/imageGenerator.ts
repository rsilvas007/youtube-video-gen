import fs from "fs";
import path from "path";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { ScriptBlock } from "./scriptGenerator.js";

export async function generateImages(
  blocks: ScriptBlock[],
  imagesDir: string,
  style?: string
): Promise<string[]> {
  fs.mkdirSync(imagesDir, { recursive: true });

  const isTechStyle = style && /tech|tecnolog|explainer|network|data|digital|modern/i.test(style);

  const imagePaths: string[] = [];

  for (const block of blocks) {
    const styleBoost = isTechStyle
      ? "cinematic tech documentary, glowing neon accents, dark background, ultra-sharp detail, 8K, professional color grading, dynamic angle, motion blur on background elements, volumetric lighting, photorealistic render"
      : "cinematic photography, dramatic lighting, high contrast, 4K ultra detailed, professional composition, golden hour, depth of field";

    const enhancedPrompt = `${block.imagePrompt}. ${styleBoost}`;

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: enhancedPrompt,
      size: "1536x1024",
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
