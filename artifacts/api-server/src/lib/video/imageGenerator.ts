import fs from "fs";
import path from "path";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { ScriptBlock } from "./scriptGenerator.js";

const VISUAL_STYLE_SUFFIX = [
  "ultra-sharp cinematic 4K, photorealistic render, volumetric lighting, deep shadows, neon accent glow",
  "IMAX quality, dramatic color grading, film grain, anamorphic lens flare, extreme detail",
  "8K photorealistic, professional color grading, bokeh depth of field, emotional weight, dynamic composition",
  "cinematic still, ultra-detailed textures, dramatic lighting ratio 3:1, strong visual hierarchy, artstation trending",
  "hyper-realistic render, cinematic grade, dark moody atmosphere, single key light, atmospheric haze",
  "award-winning photography, masterclass composition, ultra-sharp, rich contrast, emotionally charged",
  "photojournalism style, raw emotional power, available light, decisive moment, ultra-sharp focus",
  "concept art quality, environmental storytelling, dramatic scale, atmospheric perspective, epic composition",
  "technical visualization, isometric detail, neon wireframe accents on dark background, ultra-precise",
  "cinematic wide-angle, leading lines, rule of thirds, perfect exposure, depth and dimension",
];

export async function generateImages(
  blocks: ScriptBlock[],
  imagesDir: string,
  style?: string
): Promise<string[]> {
  fs.mkdirSync(imagesDir, { recursive: true });

  const isTechStyle = style
    ? /tech|tecnolog|explainer|network|data|digital|modern|cinematic documentary/i.test(style)
    : false;

  const imagePaths: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const styleSuffix = VISUAL_STYLE_SUFFIX[i % VISUAL_STYLE_SUFFIX.length];
    const cameraHint = block.cameraMovement
      ? `Camera: ${block.cameraMovement}.`
      : "";
    const techBoost = isTechStyle
      ? "glowing neon accents, dark cinematic background, holographic elements, tech documentary visual language,"
      : "";

    const enhancedPrompt = [
      block.imagePrompt,
      techBoost,
      cameraHint,
      styleSuffix,
      "NO text, NO watermark, NO logo",
    ]
      .filter(Boolean)
      .join(" ");

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: enhancedPrompt,
      size: "1536x1024",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`No image data returned for block ${block.blockNumber}`);
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
