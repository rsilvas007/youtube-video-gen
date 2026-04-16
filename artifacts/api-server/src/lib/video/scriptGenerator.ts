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

  const systemPrompt = `Você é um roteirista profissional de vídeos para YouTube. 
Crie roteiros envolventes, informativos e bem estruturados.
Escreva no idioma: ${language}.
Estilo narrativo: ${style}.`;

  const userPrompt = `Crie um roteiro detalhado sobre o tema: "${topic}"

O roteiro deve ter aproximadamente ${wordCount} palavras no total.
Divida em exatamente 10 blocos numerados (BLOCO 1, BLOCO 2... BLOCO 10).
Cada bloco deve ter frases curtas e naturais para narração.

Para cada bloco, forneça:
1. O texto de narração
2. Um prompt de imagem cinematográfica (em inglês) para ilustrar o bloco

Formato obrigatório para cada bloco:
===BLOCO {N}===
{texto de narração}
===PROMPT_IMAGEM===
{prompt em inglês, estilo cinematográfico, dramatic lighting, high contrast}
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
        text: chunk || `Narração parte ${i + 1} sobre ${content.slice(0, 50)}`,
        imagePrompt: `Cinematic scene about the topic, dramatic lighting, high contrast, 4K quality, block ${i + 1}`,
      });
    }
  }

  return blocks.slice(0, 10);
}
