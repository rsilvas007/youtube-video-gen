import fs from "fs";

// ─── STYLE DEFINITIONS ────────────────────────────────────────────────────────
export interface SubtitleStyleDef {
  name: string;
  label: string;
  description: string;
  emoji: string;
}

export const SUBTITLE_STYLE_DEFS: SubtitleStyleDef[] = [
  { name: "none",       label: "Sem Legenda",     description: "Vídeo limpo sem texto",                   emoji: "🚫" },
  { name: "clean",      label: "Limpa",            description: "Branca, profissional, contorno sutil",    emoji: "⬜" },
  { name: "bold",       label: "Bold Amarela",     description: "Grande, amarela, estilo CapCut",          emoji: "⚡" },
  { name: "neon",       label: "Neon Rosa",        description: "Pink neon, brilho, estilo TikTok",        emoji: "🌈" },
  { name: "cinematic",  label: "Cinematográfica",  description: "Itálico branco, barra escura sutil",      emoji: "🎬" },
  { name: "karaoke",    label: "Karaokê",          description: "Palavra a palavra em destaque colorido",  emoji: "🎤" },
  { name: "viral",      label: "VIRAL",            description: "MAIÚSCULAS gigantes, contorno grosso",    emoji: "🔥" },
  { name: "typewriter", label: "Typewriter",       description: "Verde neon, monospace, estilo hacker",    emoji: "💻" },
];

// ─── ASS HELPERS ─────────────────────────────────────────────────────────────
function toASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// ─── TEXT CHUNKING ────────────────────────────────────────────────────────────
function splitIntoChunks(text: string, maxWords: number): string[] {
  const sentences = text.split(/(?<=[.!?:])\s+/);
  const chunks: string[] = [];

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += maxWords) {
      const chunk = words.slice(i, i + maxWords).join(" ");
      if (chunk.trim()) chunks.push(chunk);
    }
  }

  return chunks;
}

function getChunkTiming(
  text: string,
  startTime: number,
  endTime: number,
  maxWords: number
): Array<{ text: string; start: number; end: number; words: string[] }> {
  const chunks = splitIntoChunks(text, maxWords);
  if (chunks.length === 0) return [];

  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
  const totalDuration = Math.max(endTime - startTime, 0.1);

  let currentTime = startTime;
  return chunks.map((chunk, idx) => {
    const proportion = totalChars > 0 ? chunk.length / totalChars : 1 / chunks.length;
    const isLast = idx === chunks.length - 1;
    const duration = isLast
      ? Math.max(endTime - currentTime, 0.2)
      : Math.max(proportion * totalDuration, 0.3);

    const result = {
      text: chunk,
      start: currentTime,
      end: currentTime + duration,
      words: chunk.split(/\s+/).filter(Boolean),
    };
    currentTime += duration;
    return result;
  });
}

// ─── ASS HEADER BUILDER ───────────────────────────────────────────────────────
// Colors in ASS: &HAABBGGRR (alpha=00 means opaque)
function buildASSHeader(style: string, w: number, h: number): string {
  // Scale font sizes to resolution (designed for 1920px width)
  const scale = w / 1920;
  const mv = Math.round(h * 0.07); // vertical margin from bottom
  const mh = Math.round(w * 0.05); // horizontal margin

  const sizeMap: Record<string, number> = {
    clean: 68, bold: 88, neon: 76, cinematic: 56, karaoke: 74, viral: 108, typewriter: 58,
  };
  const sz = Math.round((sizeMap[style] ?? 68) * scale);

  // ASS Style line format (fields in order):
  // Name, Font, Size, Primary, Secondary, Outline, Back, Bold, Italic, Underline, Strike,
  // ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Align, ML, MR, MV, Enc

  const styleLines: Record<string, string> = {
    // White bold text, 3px black outline, subtle shadow — classic YouTube look
    clean: `Style: Default,Arial,${sz},&H00FFFFFF,&H0000FFFF,&H00000000,&H70000000,1,0,0,0,100,100,0.5,0,1,3,1,2,${mh},${mh},${mv},1`,

    // Bold yellow text with thick black outline — CapCut bold style
    bold: `Style: Default,Arial,${sz},&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,2,${mh},${mh},${mv},1`,

    // Hot pink text with purple outline, neon glow via thick colored outline
    neon: `Style: Default,Arial,${sz},&H007A0DFF,&H0000FFFF,&H00FF00FF,&H90000000,-1,0,0,0,100,100,0,0,1,4,0,2,${mh},${mh},${mv},1`,

    // White italic on semi-transparent dark background box — cinematic
    cinematic: `Style: Default,Arial,${sz},&H00FFFFFF,&H0000FFFF,&H00000000,&HB0000000,0,1,0,0,100,100,0,0,4,0,0,2,${mh},${mh},${Math.round(mv * 1.3)},1`,

    // White + cyan secondary for karaoke highlight — Primary=white, Secondary=yellow
    karaoke: `Style: Default,Arial,${sz},&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,${mh},${mh},${mv},1`,

    // Giant white with very thick black outline — TikTok viral style
    viral: `Style: Default,Arial,${sz},&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,3,2,${mh},${mh},${Math.round(h * 0.12)},1`,

    // Bright green monospace on dark box — hacker/typewriter aesthetic
    typewriter: `Style: Default,"Courier New",${sz},&H0000FF00,&H0000FF00,&H00003300,&HDD000000,-1,0,0,0,100,100,0,0,4,2,0,2,${mh},${mh},${mv},1`,
  };

  const styleLine = styleLines[style] ?? styleLines["clean"];

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
}

// ─── KARAOKE EVENT BUILDER ────────────────────────────────────────────────────
function buildKaraokeEvent(
  chunk: { text: string; start: number; end: number; words: string[] }
): string {
  const duration = Math.max(chunk.end - chunk.start, 0.1);
  const words = chunk.words;
  const totalChars = words.reduce((s, w) => s + w.length, 1);

  let karText = "";
  for (const word of words) {
    const wDuration = (word.length / totalChars) * duration;
    const cs = Math.max(Math.round(wDuration * 100), 5);
    karText += `{\\kf${cs}}${word} `;
  }

  return `Dialogue: 0,${toASSTime(chunk.start)},${toASSTime(chunk.end)},Default,,0,0,0,,${karText.trim()}`;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export interface SubtitleBlock {
  blockNumber: number;
  text: string;
}

export function generateASSSubtitles(
  blocks: SubtitleBlock[],
  audioDurations: number[],
  subtitleStyle: string,
  outputPath: string,
  w: number,
  h: number
): boolean {
  if (!subtitleStyle || subtitleStyle === "none") return false;

  const header = buildASSHeader(subtitleStyle, w, h);
  const lines: string[] = [header, ""];

  const chunkWordCount: Record<string, number> = {
    clean: 5, bold: 4, neon: 4, cinematic: 7,
    karaoke: 6, viral: 3, typewriter: 5,
  };
  const maxWords = chunkWordCount[subtitleStyle] ?? 5;

  // Block emoji decorators for viral style (adds visual flair)
  const blockEmojis = ["🔥", "💡", "⚡", "🎯", "🚀", "💥", "🌟", "🎬", "🏆", "✨"];

  let currentTime = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const duration = Math.max(audioDurations[i] ?? 5, 0.5);
    const blockStart = currentTime;
    const blockEnd = currentTime + duration;

    let blockText = block.text.trim();

    // Style-specific text transforms
    if (subtitleStyle === "viral") {
      blockText = blockText.toUpperCase();
    }

    const chunks = getChunkTiming(blockText, blockStart, blockEnd, maxWords);

    for (const chunk of chunks) {
      let text = chunk.text;

      // Add emoji to first chunk of viral blocks for extra flair
      if (subtitleStyle === "viral" && chunk.start === chunks[0]?.start) {
        const em = blockEmojis[i % blockEmojis.length];
        text = `${em}  ${text}  ${em}`;
      }

      if (subtitleStyle === "karaoke") {
        lines.push(buildKaraokeEvent({ ...chunk, text, words: text.split(/\s+/).filter(Boolean) }));
      } else {
        lines.push(
          `Dialogue: 0,${toASSTime(chunk.start)},${toASSTime(chunk.end)},Default,,0,0,0,,${text}`
        );
      }
    }

    currentTime += duration;
  }

  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  return true;
}
