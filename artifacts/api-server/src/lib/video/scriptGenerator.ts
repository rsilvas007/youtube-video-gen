import { openai } from "@workspace/integrations-openai-ai-server";

export interface ScriptBlock {
  blockNumber: number;
  text: string;
  imagePrompt: string;
  cameraMovement: string;
  visualType: string;
}

// Mandatory visual variation sequence — no two consecutive scenes can repeat the same type
const VISUAL_SEQUENCE = [
  { type: "EXTREME CLOSE-UP / MACRO",      camera: "slow push-in, slight rack focus from foreground to subject" },
  { type: "WIDE AERIAL / ESTABLISHING",    camera: "slow drone pullback revealing massive scale, descending arc" },
  { type: "HUMAN PERSPECTIVE / EYE-LEVEL", camera: "smooth tracking shot following subject, subtle handheld shake" },
  { type: "ABSTRACT CONCEPTUAL / 3D",      camera: "slow orbit around central glowing element, parallax depth" },
  { type: "MACRO DETAIL / TENSION",        camera: "ultra-slow push-in, bokeh collapse toward sharp center point" },
  { type: "WIDE SCALE CONTRAST",           camera: "crane shot rising from ground, tiny figure vs massive backdrop" },
  { type: "HUMAN EMOTIONAL / CLOSE",       camera: "slow dolly forward toward subject face, shallow depth of field" },
  { type: "ABSTRACT DRAMATIC / CLIMAX",    camera: "rapid zoom then freeze, Dutch tilt, unstable then stabilizing" },
  { type: "WIDE RESOLUTION / PULLBACK",    camera: "smooth pullback revealing full scene context, final reveal" },
  { type: "MACRO TEASER / OPEN LOOP",      camera: "slow push-in on detail that doesn't resolve, loop suggestion" },
];

// Block structure blueprint for maximum retention
const BLOCK_BLUEPRINT = [
  { role: "HOOK (3 SECONDS)", instruction: "Start with a shocking statement, impossible visual, or brutal contradiction. NOT 'olá' or 'bem-vindos'. Promise something the viewer must see. Use 1-3 very short punchy sentences." },
  { role: "ABERTURA EXPANSIVA", instruction: "Why does this matter to YOU right now? Create emotional stakes. Leave an open question. Vary sentence length: short. Then a much longer more flowing sentence. Then short again." },
  { role: "CONTEXTO / SETUP", instruction: "Establish the world of this topic. Plant the first open loop — a mystery you won't resolve yet. Foreshadow the revelation in block 8." },
  { role: "MERGULHO PROFUNDO 1", instruction: "First layer of technical/conceptual depth. Accessible but not dumbed down. End with a micro-cliffhanger — 'but that's not the most surprising part'." },
  { role: "MINI CLIFFHANGER", instruction: "Reveal something unexpected that reframes everything said so far. Short dramatic sentences. Build tension. Don't resolve it — open a new loop instead." },
  { role: "REVELAÇÃO 1", instruction: "Scale reveal — show the true magnitude of the topic. Use contrast (small vs enormous, simple vs complex). The viewer should feel a shift in understanding." },
  { role: "PERSPECTIVA HUMANA", instruction: "Ground the technical concept in human experience. Use 'você', 'imagine', 'agora mesmo enquanto você assiste'. Create empathy and personal relevance." },
  { role: "CLÍMAX EMOCIONAL (70–80%)", instruction: "This is the highest emotional peak. The most important revelation. Short sentences that hit like punches. Close the first loop. Open the biggest final question." },
  { role: "RESOLUÇÃO / SÍNTESE", instruction: "Synthesize all threads. Answer most questions. Let the viewer feel smart for watching. But leave one major loop deliberately open." },
  { role: "CONCLUSÃO COM LOOP ABERTO", instruction: "End with a question or statement that demands the viewer think further. NO 'gostou do vídeo'. Tease the next level of depth. The last sentence should haunt them." },
];

export async function generateScript(
  topic: string,
  style: string,
  durationMinutes: number,
  language: string,
  blockCount: number = 10
): Promise<ScriptBlock[]> {
  const n = Math.min(blockCount, BLOCK_BLUEPRINT.length);
  const wordsPerBlock = Math.round((durationMinutes * 130) / n);

  const systemPrompt = `Você é o melhor roteirista de YouTube do mundo para vídeos documentários de tecnologia.
Seu trabalho é criar roteiros que PRENDAM o espectador do primeiro ao último segundo.
Idioma: ${language}. Tom: ${style}.

REGRAS ABSOLUTAS QUE NUNCA PODEM SER QUEBRADAS:
1. JAMAIS comece com "Olá", "Bem-vindos", "Hoje vamos", "Neste vídeo"
2. JAMAIS use narração genérica ("É importante destacar", "Como podemos ver", "Conforme mencionado")
3. JAMAIS feche todos os loops ao mesmo tempo — sempre deixe um aberto
4. Varie o comprimento das frases: curta. Depois uma frase mais longa com mais informação e contexto. Depois curta novamente.
5. Cada bloco deve conectar cinematograficamente ao próximo
6. Os prompts de imagem NUNCA podem repetir o mesmo ângulo, iluminação ou tipo visual que o bloco anterior`;

  const blocksSpec = BLOCK_BLUEPRINT.slice(0, n).map((blueprint, i) => {
    const visual = VISUAL_SEQUENCE[i % VISUAL_SEQUENCE.length];
    return `
===BLOCO ${i + 1}===
PAPEL NARRATIVO: ${blueprint.role}
INSTRUÇÃO: ${blueprint.instruction}
TIPO VISUAL OBRIGATÓRIO: ${visual.type}
MOVIMENTO DE CÂMERA OBRIGATÓRIO: ${visual.camera}
PALAVRAS APROXIMADAS: ${wordsPerBlock}

NARRAÇÃO EM ${language}:
[escreva aqui]

PROMPT DE IMAGEM (em inglês, 60-80 palavras, incluindo: perspectiva ${visual.type}, iluminação dramática, emoção, movimento implícito, técnica cinematográfica):
[escreva aqui]
===FIM_BLOCO ${i + 1}===`;
  }).join("\n\n");

  const userPrompt = `Crie um roteiro completo de vídeo documentário sobre:

TEMA: "${topic}"

Siga EXATAMENTE a estrutura abaixo para os ${n} blocos. Cada bloco tem um papel narrativo específico e um tipo visual OBRIGATÓRIO diferente para garantir que nunca haja duas cenas consecutivas iguais.

${blocksSpec}

CHECKLIST FINAL (verifique antes de responder):
✅ O bloco 1 começa com choque/contradição/afirmação impossível?
✅ Cada prompt de imagem tem perspectiva + iluminação + emoção + movimento especificados?
✅ Nenhum prompt repete o mesmo ângulo ou composição do bloco anterior?
✅ Há pelo menos 2 loops abertos que nunca fecham completamente?
✅ O clímax emocional está no bloco 8?
✅ O bloco 10 termina com uma pergunta ou afirmação que ressoa?`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",  // FIX A-02: era "gpt-5.2" — modelo inexistente na API OpenAI
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

  // Try to parse the structured format
  for (let i = 1; i <= 10; i++) {
    const blockPattern = new RegExp(
      `===BLOCO ${i}===[\\s\\S]*?NARRAÇÃO[^:]*:\\s*([\\s\\S]*?)PROMPT DE IMAGEM[^:]*:\\s*([\\s\\S]*?)===FIM_BLOCO ${i}===`,
      "i"
    );
    const match = content.match(blockPattern);
    if (match) {
      const text = match[1].trim().replace(/^\[.*?\]\s*/, "").trim();
      const imagePrompt = match[2].trim().replace(/^\[.*?\]\s*/, "").trim();
      const visual = VISUAL_SEQUENCE[i - 1];
      if (text && imagePrompt) {
        blocks.push({
          blockNumber: i,
          text,
          imagePrompt,
          cameraMovement: visual.camera,
          visualType: visual.type,
        });
      }
    }
  }

  // Fallback: try simple regex
  if (blocks.length < 5) {
    blocks.length = 0;
    const simpleRegex = /===BLOCO (\d+)===([\s\S]*?)===FIM_BLOCO \1===/g;
    let match;
    while ((match = simpleRegex.exec(content)) !== null) {
      const blockNumber = parseInt(match[1], 10);
      const blockContent = match[2];
      const narracao = blockContent.match(/NARRAÇÃO[^:]*:([\s\S]*?)(?:PROMPT|$)/i)?.[1]?.trim() ?? "";
      const prompt = blockContent.match(/PROMPT[^:]*:([\s\S]*?)$/i)?.[1]?.trim() ?? "";
      const visual = VISUAL_SEQUENCE[(blockNumber - 1) % 10];
      if (narracao) {
        blocks.push({
          blockNumber,
          text: narracao.replace(/^\[.*?\]\s*/, "").trim(),
          imagePrompt: prompt.replace(/^\[.*?\]\s*/, "").trim() || generateFallbackPrompt(blockNumber),
          cameraMovement: visual.camera,
          visualType: visual.type,
        });
      }
    }
  }

  // Last resort fallback
  if (blocks.length === 0) {
    const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("===") && !l.startsWith("#"));
    const chunkSize = Math.ceil(lines.length / 10);
    for (let i = 0; i < 10; i++) {
      const visual = VISUAL_SEQUENCE[i];
      blocks.push({
        blockNumber: i + 1,
        text: lines.slice(i * chunkSize, (i + 1) * chunkSize).join(" ").trim() || `Narração parte ${i + 1}`,
        imagePrompt: generateFallbackPrompt(i + 1),
        cameraMovement: visual.camera,
        visualType: visual.type,
      });
    }
  }

  return blocks.slice(0, 10);
}

function generateFallbackPrompt(blockNumber: number): string {
  const visual = VISUAL_SEQUENCE[(blockNumber - 1) % 10];
  const prompts: Record<string, string> = {
    "EXTREME CLOSE-UP / MACRO": "Extreme macro close-up of a single glowing data node, bokeh background of vast dark server farm, photorealistic, ultra-sharp, cinematic 4K, slight lens flare, emotional weight, slow push-in motion blur",
    "WIDE AERIAL / ESTABLISHING": "Bird's eye aerial view of city at night with glowing blue Wi-Fi signal waves emanating from buildings, scale contrast between tiny streets and massive invisible network, drone pullback, fog at edges, dawn light",
    "HUMAN PERSPECTIVE / EYE-LEVEL": "First-person POV through a glowing fiber optic tunnel, data packets rushing past like comets, neon cyan and white streaks on deep black background, slight handheld motion, immersive depth, photorealistic",
    "ABSTRACT CONCEPTUAL / 3D": "Abstract 3D visualization of a neural network or data topology, floating nodes connected by glowing threads, deep space background, slow orbit camera, volumetric light rays, ultra-detailed render",
    "MACRO DETAIL / TENSION": "Ultra-macro photograph of circuit board traces glowing with electric current, depth of field pulling focus through layers of silicon, dark moody background, tension and precision, ultra-sharp center",
    "WIDE SCALE CONTRAST": "Single lone human figure standing at center of a massive glowing network grid stretching to the horizon, dramatic scale contrast, volumetric fog, dawn light, IMAX quality, crane shot rising",
    "HUMAN EMOTIONAL / CLOSE": "Close-up of determined human face bathed in the blue glow of multiple screens, shallow depth of field, soft bokeh background showing blurred network data, emotional depth, slow dolly forward",
    "ABSTRACT DRAMATIC / CLIMAX": "Explosive data visualization — thousands of glowing packets converging at a single point of white light, dark background, cinematic lens flare, Dutch tilt, freeze frame energy, dramatic tension",
    "WIDE RESOLUTION / PULLBACK": "Wide-angle shot of a modern data center interior, rows of servers glowing blue, symmetric composition, smooth pullback revealing infinite scale, cool color grading, photorealistic render",
    "MACRO TEASER / OPEN LOOP": "Extreme close-up of an unknown glowing element that suggests something larger is hidden — blurred edges, mystery, slow push-in that never quite resolves, cinematic 4K, emotional weight",
  };
  return prompts[visual.type] ?? `Cinematic ${visual.type} shot, dramatic lighting, 8K photorealistic, emotional depth`;
}
