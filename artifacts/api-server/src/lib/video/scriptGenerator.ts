import { openai } from "@workspace/integrations-openai-ai-server";

export interface ScriptBlock {
  blockNumber: number;
  text: string;
  imagePrompt: string;
}

export async function generateScript(
  topic: string,
  style: string,
  durationMinutes: number,
  language: string
): Promise<ScriptBlock[]> {
  const wordCount = durationMinutes * 130; // approx 130 words per minute

  const isTechStyle = /tech|tecnolog|explainer|network|data|digital|modern|cinematic documentary/i.test(style);

  const imagePromptGuidance = isTechStyle
    ? `Para os prompts de imagem, use visualizações tecnológicas cinematográficas em inglês:
- Glowing network topology maps, floating data packets, neon blue/cyan connections on dark background
- Close-up macro photography of circuit boards, fiber optic cables, router hardware
- Abstract 3D data flow visualization, holographic interfaces, digital signal waves
- Aerial view of cityscape with glowing Wi-Fi signal waves emanating from buildings
- Split-screen showing device screen + router + signal path simultaneously
- Microscopic view of electromagnetic waves, photorealistic renders with dramatic lighting
- Dynamic camera angles: low-angle, bird's-eye, Dutch tilt, extreme close-up
Estilo visual: cinematic tech documentary, dark moody background, volumetric light rays, ultra-sharp, photorealistic`
    : `Para os prompts de imagem, use fotografias cinematográficas em inglês com:
- Dramatic lighting, golden hour, depth of field, professional composition
- Wide establishing shots alternating with close-up details
- High contrast, rich colors, film grain aesthetic`;

  const systemPrompt = `Você é um roteirista profissional de vídeos educativos e documentários para YouTube.
Crie roteiros envolventes, informativos, claros e bem estruturados.
Escreva no idioma: ${language}.
Estilo narrativo: ${style}.
Use linguagem acessível mas precisa. Cada bloco deve fluir naturalmente para o próximo.`;

  const userPrompt = `Crie um roteiro detalhado sobre o tema: "${topic}"

O roteiro deve ter aproximadamente ${wordCount} palavras no total.
Divida em exatamente 10 blocos numerados (BLOCO 1, BLOCO 2... BLOCO 10).
Cada bloco deve ter frases curtas, dinâmicas e naturais para narração em voz.
Use transições naturais entre blocos.

${imagePromptGuidance}

Formato obrigatório para cada bloco (siga EXATAMENTE):
===BLOCO {N}===
{texto de narração em ${language}, direto e envolvente}
===PROMPT_IMAGEM===
{prompt detalhado em inglês para a imagem deste bloco}
===FIM_BLOCO===`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "";
  return parseScript(content);
}

function parseScript(content: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  const blockRegex =
    /===BLOCO (\d+)===([\s\S]*?)===PROMPT_IMAGEM===([\s\S]*?)===FIM_BLOCO===/g;

  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const blockNumber = parseInt(match[1], 10);
    const text = match[2].trim();
    const imagePrompt = match[3].trim();

    if (text && imagePrompt) {
      blocks.push({ blockNumber, text, imagePrompt });
    }
  }

  if (blocks.length === 0) {
    const lines = content.split("\n").filter((l) => l.trim());
    const chunkSize = Math.ceil(lines.length / 10);
    for (let i = 0; i < 10; i++) {
      const chunk = lines
        .slice(i * chunkSize, (i + 1) * chunkSize)
        .join(" ")
        .trim();
      blocks.push({
        blockNumber: i + 1,
        text: chunk || `Narração parte ${i + 1}`,
        imagePrompt: `Cinematic tech visualization, glowing network connections, dark background, neon blue accents, 8K photorealistic, block ${i + 1}`,
      });
    }
  }

  return blocks.slice(0, 10);
}
