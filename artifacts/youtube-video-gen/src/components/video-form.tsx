import React, { useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateVideo, getListVideosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Zap, Image, Film, ChevronDown, ChevronUp, Mic, FileText, Monitor, Play, Square } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── SCRIPT MODELS ────────────────────────────────────────────────────────────
const SCRIPT_MODELS = [
  { group: "Google Gemini", items: [
    { value: "gemini-2.5-flash",      label: "Gemini 2.5 Flash",      desc: "Rápido e eficiente" },
    { value: "gemini-2.5-pro",        label: "Gemini 2.5 Pro",         desc: "Máxima qualidade Google" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", desc: "Próxima geração, rápido" },
    { value: "gemini-3-pro-preview",  label: "Gemini 3 Pro Preview",   desc: "Próxima geração, premium" },
    { value: "gemini-3.1-pro-preview",label: "Gemini 3.1 Pro Preview", desc: "Mais avançado disponível" },
  ]},
  { group: "OpenAI GPT", items: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Rápido e barato" },
    { value: "gpt-4o",      label: "GPT-4o",       desc: "Qualidade alta OpenAI" },
  ]},
];

// ─── IMAGE MODELS ─────────────────────────────────────────────────────────────
const IMAGE_MODELS_GROUPS = [
  { group: "Google Gemini (Nativo)", items: [
    { value: "gemini-2.5-flash-image",       label: "Gemini NanoBanana",     desc: "Gemini 2.5 Flash nativo" },
    { value: "gemini-3-pro-image-preview",   label: "Gemini NanoBanana Pro", desc: "Gemini 3 Pro Image nativo" },
    { value: "gemini-3.1-flash-image-preview",label: "Gemini NanoBanana 2",  desc: "Gemini 3.1 Flash Image" },
  ]},
  { group: "Flux / Pollinations", items: [
    { value: "flux",             label: "Flux Schnell",         desc: "Rápido, qualidade alta" },
    { value: "flux-realism",     label: "Flux Realism",         desc: "Hiper-realista" },
    { value: "flux-cinematic",   label: "Flux Cinematic",       desc: "Estilo cinematográfico" },
    { value: "flux-pro",         label: "Flux Pro",             desc: "Máxima qualidade Flux" },
    { value: "kontext",          label: "FLUX.1 Kontext",       desc: "Edição contextual avançada" },
    { value: "klein",            label: "FLUX.2 Klein 4B",      desc: "Rápido com edição" },
    { value: "zimage",           label: "Z-Image Turbo",        desc: "Flux 6B + upscale 2x" },
  ]},
  { group: "OpenAI / xAI / Amazon", items: [
    { value: "gptimage",         label: "GPT Image 1 Mini",     desc: "OpenAI Mini" },
    { value: "gptimage-large",   label: "GPT Image 1.5",        desc: "OpenAI avançado" },
    { value: "grok-imagine",     label: "Grok Imagine",         desc: "xAI oficial" },
    { value: "grok-imagine-pro", label: "Grok Imagine Pro",     desc: "xAI Aurora Pro" },
    { value: "nova-canvas",      label: "Nova Canvas",          desc: "Amazon Bedrock" },
  ]},
  { group: "Alibaba / ByteDance", items: [
    { value: "seedream5",        label: "Seedream 5.0",         desc: "ByteDance ARK" },
    { value: "wan-image",        label: "Wan 2.7 Image",        desc: "Alibaba até 2K" },
    { value: "wan-image-pro",    label: "Wan 2.7 Image Pro",    desc: "Alibaba 4K + thinking" },
    { value: "qwen-image",       label: "Qwen Image Plus",      desc: "Alibaba DashScope" },
    { value: "p-image",          label: "p-image (Pruna)",      desc: "Rápido text-to-image" },
  ]},
];

// ─── VIDEO MODELS ─────────────────────────────────────────────────────────────
const VIDEO_MODELS = [
  { value: "seedance",       label: "Seedance Lite",     desc: "BytePlus — qualidade alta" },
  { value: "seedance-pro",   label: "Seedance Pro-Fast", desc: "BytePlus — melhor aderência" },
  { value: "wan-fast",       label: "Wan 2.2 Fast",      desc: "Alibaba — rápido 480P 5s" },
  { value: "wan",            label: "Wan 2.6",           desc: "Alibaba — 1080P 2-15s + áudio" },
  { value: "veo",            label: "Veo 3.1 Fast",      desc: "Google — preview" },
  { value: "grok-video-pro", label: "Grok Video Pro",    desc: "xAI — 720p 1-15s" },
  { value: "ltx-2",          label: "LTX-2.3",           desc: "Rápido + upscaler" },
  { value: "p-video",        label: "p-video (Pruna)",   desc: "Text/image-to-video 1080p" },
  { value: "nova-reel",      label: "Nova Reel",         desc: "Amazon Bedrock 720p 6-60s" },
  { value: "ken-burns",      label: "Ken Burns (local)", desc: "Animação dinâmica — sem API" },
];

// ─── VOICES ───────────────────────────────────────────────────────────────────
const ELEVENLABS_VOICES = [
  { id: "7u8qsX4HQsSHJ0f8xsQZ", name: "João Pedro",     desc: "Português Brasileiro", flag: "🇧🇷" },
  { id: "TD909tfKkCKoStDEEElr", name: "Rafael Pereira", desc: "Multilingual",          flag: "🌍" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",         desc: "Narrador Britânico",    flag: "🇬🇧" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George",         desc: "Storyteller Britânico", flag: "🇬🇧" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian",          desc: "Voz Grave",             flag: "🎙️" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill",           desc: "Sábio e Maduro",        flag: "🎙️" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum",         desc: "Intenso e Dramático",   flag: "🎙️" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah",          desc: "Feminina Confiante",    flag: "🎙️" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda",        desc: "Profissional",          flag: "🎙️" },
];

const GEMINI_TTS_VOICES = [
  { id: "gemini-tts:Kore",        name: "Kore",        desc: "2.5 Flash — Firme, Expressivo" },
  { id: "gemini-tts:Fenrir",      name: "Fenrir",      desc: "2.5 Flash — Entusiasmado" },
  { id: "gemini-tts:Charon",      name: "Charon",      desc: "2.5 Flash — Informativo, Sério" },
  { id: "gemini-tts:Puck",        name: "Puck",        desc: "2.5 Flash — Animado, Vibrante" },
  { id: "gemini-tts:Orus",        name: "Orus",        desc: "2.5 Flash — Firme, Autoritário" },
  { id: "gemini-tts:Aoede",       name: "Aoede",       desc: "2.5 Flash — Suave, Tranquilo" },
  { id: "gemini-tts:Leda",        name: "Leda",        desc: "2.5 Flash — Jovem, Caloroso" },
  { id: "gemini-tts:Zephyr",      name: "Zephyr",      desc: "2.5 Flash — Brilhante, Claro" },
  { id: "gemini-3.1-tts:Kore",    name: "Kore 3.1",    desc: "3.1 Flash — Firme, Expressivo" },
  { id: "gemini-3.1-tts:Fenrir",  name: "Fenrir 3.1",  desc: "3.1 Flash — Entusiasmado" },
  { id: "gemini-3.1-tts:Charon",  name: "Charon 3.1",  desc: "3.1 Flash — Informativo" },
  { id: "gemini-3.1-tts:Puck",    name: "Puck 3.1",    desc: "3.1 Flash — Animado" },
  { id: "gemini-3.1-tts:Algieba", name: "Algieba",     desc: "3.1 Flash — Grave, Intenso ★" },
  { id: "gemini-3.1-tts:Callirrhoe", name: "Callirrhoe", desc: "3.1 Flash — Melodioso ★" },
  { id: "gemini-3.1-tts:Despina", name: "Despina",     desc: "3.1 Flash — Expressivo ★" },
  { id: "gemini-3.1-tts:Alnilam", name: "Alnilam",     desc: "3.1 Flash — Profundo ★" },
  { id: "gemini-3.1-tts:Iapetus", name: "Iapetus",     desc: "3.1 Flash — Dramático ★" },
  { id: "gemini-3.1-tts:Rasalgethi", name: "Rasalgethi", desc: "3.1 Flash — Épico ★" },
];

// OpenAI TTS is not supported by the Replit proxy — map to Gemini TTS equivalents
const OPENAI_VOICES = [
  { id: "gemini-tts:Charon",              name: "Onyx",    desc: "Grave e Profundo" },
  { id: "gemini-tts:Fenrir",              name: "Echo",    desc: "Masculino" },
  { id: "gemini-3.1-tts:Iapetus",         name: "Fable",   desc: "Dramático" },
  { id: "gemini-tts:Orus",               name: "Alloy",   desc: "Neutro" },
  { id: "gemini-tts:Leda",               name: "Nova",    desc: "Feminino" },
  { id: "gemini-tts:Aoede",              name: "Shimmer", desc: "Suave" },
  { id: "gemini-tts:Zephyr",             name: "Ash",     desc: "Brilhante e Claro" },
  { id: "gemini-3.1-tts:Callirrhoe",     name: "Ballad",  desc: "Narrativo" },
  { id: "gemini-3.1-tts:Algieba",        name: "Sage",    desc: "Sábio e Grave" },
  { id: "gemini-3.1-tts:Rasalgethi",     name: "Verse",   desc: "Épico, Expressivo" },
];

// ─── SUBTITLE STYLES ──────────────────────────────────────────────────────────
const SUBTITLE_STYLES = [
  { value: "none",       label: "Sem Legenda",     emoji: "🚫", preview: "—",                         color: "text-muted-foreground" },
  { value: "clean",      label: "Limpa",            emoji: "⬜", preview: "Texto Limpo",               color: "text-white" },
  { value: "bold",       label: "Bold CapCut",      emoji: "⚡", preview: "BOLD AMARELO",              color: "text-yellow-400 font-black" },
  { value: "neon",       label: "Neon Rosa",        emoji: "🌈", preview: "NEON",                      color: "text-pink-400 font-bold" },
  { value: "cinematic",  label: "Cinemático",       emoji: "🎬", preview: "Cinematográfico",           color: "text-white/80 italic" },
  { value: "karaoke",    label: "Karaokê",          emoji: "🎤", preview: "Palavra a Palavra",         color: "text-cyan-300 font-bold" },
  { value: "viral",      label: "VIRAL",            emoji: "🔥", preview: "🔥 VIRAL! 🔥",              color: "text-white font-black" },
  { value: "typewriter", label: "Typewriter",       emoji: "💻", preview: "green_hack_mode",           color: "text-green-400 font-mono" },
];

// ─── PLATFORMS ────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { value: "youtube",            label: "YouTube",               ratio: "16:9", res: "1920×1080",  icon: "▶" },
  { value: "reels",              label: "Instagram Reels",        ratio: "9:16", res: "1080×1920",  icon: "📸" },
  { value: "tiktok",             label: "TikTok",                ratio: "9:16", res: "1080×1920",  icon: "🎵" },
  { value: "shorts",             label: "YouTube Shorts",         ratio: "9:16", res: "1080×1920",  icon: "⚡" },
  { value: "instagram-square",   label: "Instagram Quadrado",     ratio: "1:1",  res: "1080×1080",  icon: "⬛" },
  { value: "instagram-vertical", label: "Instagram Vertical",     ratio: "4:5",  res: "1080×1350",  icon: "📱" },
];

// ─── DURATION PRESETS ─────────────────────────────────────────────────────────
const DURATION_PRESETS = [
  { value: 0.5, label: "30s",    sub: "3 cenas",  tag: "Shorts/Reels",   color: "text-yellow-400" },
  { value: 1,   label: "1 min",  sub: "4 cenas",  tag: "TikTok/Reels",   color: "text-pink-400" },
  { value: 2,   label: "2 min",  sub: "5 cenas",  tag: "TikTok",         color: "text-cyan-400" },
  { value: 3,   label: "3 min",  sub: "6 cenas",  tag: "YouTube",        color: "text-red-400" },
  { value: 5,   label: "5 min",  sub: "8 cenas",  tag: "YouTube",        color: "text-red-400" },
  { value: 8,   label: "8 min",  sub: "10 cenas", tag: "YouTube Longo",  color: "text-orange-400" },
  { value: 10,  label: "10 min", sub: "10 cenas", tag: "YouTube+",       color: "text-primary" },
  { value: 15,  label: "15 min", sub: "10 cenas", tag: "YouTube Max",    color: "text-purple-400" },
];

// ─── SCHEMA ───────────────────────────────────────────────────────────────────
const videoFormSchema = z.object({
  topic: z.string().min(3, "O tema é obrigatório").max(200),
  style: z.enum(["curioso", "misterioso", "educativo", "dramático"]),
  durationMinutes: z.coerce.number().min(0.5).max(15),
  voice: z.string().min(1, "Selecione uma voz"),
  language: z.string().default("pt-BR"),
  platform: z.string().default("youtube"),
  scriptModel: z.string().default("gemini-2.5-flash"),
  imageModel: z.string().default("flux-realism"),
  videoModel: z.string().default("seedance"),
  customScript: z.string().optional(),
  subtitleStyle: z.string().default("none"),
});

type VideoFormValues = z.infer<typeof videoFormSchema>;

// ─── VOICE ROW SUBCOMPONENT ───────────────────────────────────────────────────
interface VoiceRowProps {
  id: string;
  name: string;
  desc: string;
  selected: boolean;
  playing: boolean;
  loading: boolean;
  onSelect: () => void;
  onPlay: (e: React.MouseEvent) => void;
  noPreview?: boolean;
}

function VoiceRow({ name, desc, selected, playing, loading, onSelect, onPlay, noPreview }: VoiceRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-all border-b border-border/10 last:border-0 ${
        selected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-muted/30 border-l-2 border-l-transparent"
      }`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${selected ? "bg-primary" : "bg-muted-foreground/20"}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-tight truncate ${selected ? "text-primary" : "text-foreground"}`}>{name}</p>
        <p className="text-[10px] text-muted-foreground/70 leading-tight truncate">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onPlay}
        disabled={loading || noPreview}
        title={noPreview ? "Preview não disponível para OpenAI" : playing ? "Parar" : "Ouvir amostra"}
        className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-all ${
          noPreview
            ? "opacity-20 cursor-not-allowed"
            : playing
            ? "text-primary bg-primary/20 hover:bg-primary/30"
            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
        }`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : playing ? (
          <Square className="w-3 h-3 fill-current" />
        ) : (
          <Play className="w-3 h-3 fill-current" />
        )}
      </button>
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export function VideoForm() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createVideo = useCreateVideo();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ElevenLabs voice browser
  interface ELVoice {
    voice_id: string;
    name: string;
    category: string;
    preview_url?: string;
    labels?: { gender?: string; accent?: string; description?: string; language?: string; use_case?: string };
  }
  const [showElBrowser, setShowElBrowser] = useState(false);
  const [elVoices, setElVoices] = useState<ELVoice[]>([]);
  const [elLoading, setElLoading] = useState(false);
  const [elError, setElError] = useState<string | null>(null);
  const [elSearch, setElSearch] = useState("");

  const fetchElVoices = useCallback(async () => {
    if (elVoices.length > 0) return; // already loaded
    setElLoading(true);
    setElError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/voices/elevenlabs`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as { voices: ELVoice[] };
      // Sort: premade first, then by name
      const sorted = (json.voices ?? []).sort((a, b) => {
        if (a.category === "premade" && b.category !== "premade") return -1;
        if (a.category !== "premade" && b.category === "premade") return 1;
        return a.name.localeCompare(b.name);
      });
      setElVoices(sorted);
    } catch (err) {
      setElError(err instanceof Error ? err.message : "Erro ao carregar vozes");
    } finally {
      setElLoading(false);
    }
  }, [elVoices.length]);

  const handleToggleElBrowser = useCallback(() => {
    const next = !showElBrowser;
    setShowElBrowser(next);
    if (next) fetchElVoices();
  }, [showElBrowser, fetchElVoices]);

  const handlePlayVoice = async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (playingVoice === voiceId) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingVoice(null);
      return;
    }

    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingVoice(null);

    const isGemini = voiceId.startsWith("gemini-tts:") || voiceId.startsWith("gemini-3.1-tts:");
    const isEleven = voiceId.length > 18 && !voiceId.includes(":");
    if (!isGemini && !isEleven) {
      toast.info("Preview não disponível para vozes OpenAI.");
      return;
    }

    setLoadingVoice(voiceId);
    try {
      const res = await fetch(`${BASE_URL}/api/voices/preview?voice=${encodeURIComponent(voiceId)}`);
      if (!res.ok) throw new Error("Falha ao carregar preview");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingVoice(voiceId);
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlayingVoice(null); };
      await audio.play();
    } catch {
      toast.error("Erro ao carregar preview de voz.");
    } finally {
      setLoadingVoice(null);
    }
  };

  const form = useForm<VideoFormValues>({
    resolver: zodResolver(videoFormSchema),
    defaultValues: {
      topic: "",
      style: "curioso",
      durationMinutes: 10,
      voice: "7u8qsX4HQsSHJ0f8xsQZ",
      language: "pt-BR",
      platform: "youtube",
      scriptModel: "gemini-2.5-flash",
      imageModel: "flux-realism",
      videoModel: "seedance",
      subtitleStyle: "none",
    },
  });

  const onSubmit = (data: VideoFormValues) => {
    const payload = {
      ...data,
      customScript: useCustomScript && data.customScript?.trim() ? data.customScript.trim() : undefined,
    };
    createVideo.mutate(
      { data: payload },
      {
        onSuccess: (video) => {
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
          toast.success(useCustomScript ? "Vídeo com roteiro próprio criado!" : "Vídeo criado com sucesso!");
          setLocation(`/videos/${video.id}`);
        },
        onError: () => {
          toast.error("Falha ao criar o vídeo");
        },
      }
    );
  };

  return (
    <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-xl p-6 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-indigo-500/50"></div>
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="mb-6">
        <h2 className="text-xl font-medium tracking-tight flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Nova Geração
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Configure os parâmetros do pipeline.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

          {/* Topic */}
          <FormField
            control={form.control}
            name="topic"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Tema</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: O Mistério das Pirâmides do Egito" className="font-medium bg-background/50 border-border/50 focus-visible:ring-primary/50 transition-all" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Platform Selection */}
          <FormField
            control={form.control}
            name="platform"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1">
                  <Monitor className="w-3 h-3" /> Plataforma de Destino
                </FormLabel>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {PLATFORMS.map((p) => {
                    const isSelected = field.value === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => field.onChange(p.value)}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-all cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/40 bg-background/30 text-muted-foreground hover:border-border hover:text-foreground"
                        }`}
                      >
                        <span className="text-xl leading-none">{p.icon}</span>
                        <span className="text-[10px] font-medium leading-tight">{p.label}</span>
                        <span className={`text-[9px] font-mono px-1 rounded ${isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>{p.ratio}</span>
                        <span className="text-[8px] text-muted-foreground font-mono">{p.res}</span>
                      </button>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Style */}
          <FormField
            control={form.control}
            name="style"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Estilo</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50 border-border/50 focus:ring-primary/50 transition-all">
                      <SelectValue placeholder="Selecione o estilo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="curioso">Curioso</SelectItem>
                    <SelectItem value="misterioso">Misterioso</SelectItem>
                    <SelectItem value="educativo">Educativo</SelectItem>
                    <SelectItem value="dramático">Dramático</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Duration Preset Picker */}
          <FormField
            control={form.control}
            name="durationMinutes"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between mb-2">
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono m-0">⏱ Duração</FormLabel>
                  <span className="text-xs text-primary/70 font-mono font-semibold">
                    {DURATION_PRESETS.find(p => p.value === field.value)?.label ?? `${field.value} min`}
                    {" — "}
                    <span className="text-muted-foreground">{DURATION_PRESETS.find(p => p.value === field.value)?.sub ?? ""}</span>
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {DURATION_PRESETS.map((preset) => {
                    const isSelected = field.value === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => field.onChange(preset.value)}
                        className={`flex flex-col items-center justify-center gap-0.5 py-3 px-1 rounded-lg border transition-all text-center ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
                            : "border-border/40 bg-background/30 hover:border-border hover:bg-muted/20"
                        }`}
                      >
                        <span className={`text-sm font-black leading-none font-mono ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {preset.label}
                        </span>
                        <span className={`text-[9px] font-mono mt-1 leading-tight ${isSelected ? preset.color : "text-muted-foreground/60"}`}>
                          {preset.tag}
                        </span>
                        <span className="text-[8px] text-muted-foreground/40 font-mono mt-0.5">
                          {preset.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* AI Models Section */}
          <div className="border border-border/40 rounded-lg p-4 space-y-4 bg-background/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold">Modelos de IA</span>
              <span className="text-xs text-primary/70 font-mono">Gemini + Pollinations</span>
            </div>

            {/* Script: Toggle between AI generation and custom */}
            <div>
              <div className="flex items-center gap-1 mb-2">
                <FileText className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold">Roteiro</span>
                <div className="ml-auto flex items-center bg-muted/30 rounded-md p-0.5 border border-border/30">
                  <button
                    type="button"
                    onClick={() => setUseCustomScript(false)}
                    className={`text-[10px] font-mono px-2 py-1 rounded transition-all ${!useCustomScript ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    GERAR COM IA
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseCustomScript(true)}
                    className={`text-[10px] font-mono px-2 py-1 rounded transition-all ${useCustomScript ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    MEU ROTEIRO
                  </button>
                </div>
              </div>

              {useCustomScript ? (
                <FormField
                  control={form.control}
                  name="customScript"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Cole seu roteiro aqui. O Gemini irá dividir automaticamente em 10 blocos e gerar prompts de imagem para cada trecho..."
                          className="min-h-[180px] text-xs font-mono bg-background/50 border-border/50 focus-visible:ring-primary/50 resize-y leading-relaxed placeholder:text-muted-foreground/40"
                        />
                      </FormControl>
                      <div className="flex items-center justify-between">
                        <FormMessage />
                        <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto">
                          {field.value?.trim().split(/\s+/).filter(Boolean).length ?? 0} palavras
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                        ✨ O Gemini divide o roteiro em 10 blocos e cria prompts cinematográficos para cada imagem automaticamente.
                      </p>
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="scriptModel"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 border-border/50 focus:ring-primary/50 transition-all">
                            <SelectValue placeholder="Modelo de roteiro" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover border-border max-h-72">
                          {SCRIPT_MODELS.map((g) => (
                            <SelectGroup key={g.group}>
                              <SelectLabel className="text-xs text-primary/70 font-mono">{g.group}</SelectLabel>
                              {g.items.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{m.label}</span>
                                    <span className="text-xs text-muted-foreground">{m.desc}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Image Model */}
              <FormField
                control={form.control}
                name="imageModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1">
                      <Image className="w-3 h-3" /> Imagem
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 border-border/50 focus:ring-primary/50 transition-all">
                          <SelectValue placeholder="Modelo de imagem" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover border-border max-h-80">
                        {IMAGE_MODELS_GROUPS.map((g) => (
                          <SelectGroup key={g.group}>
                            <SelectLabel className="text-xs text-primary/70 font-mono">{g.group}</SelectLabel>
                            {g.items.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{m.label}</span>
                                  <span className="text-xs text-muted-foreground">{m.desc}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Video Model */}
              <FormField
                control={form.control}
                name="videoModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1">
                      <Film className="w-3 h-3" /> Vídeo
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 border-border/50 focus:ring-primary/50 transition-all">
                          <SelectValue placeholder="Modelo de vídeo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover border-border max-h-72">
                        {VIDEO_MODELS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            <div className="flex flex-col">
                              <span className="font-medium">{m.label}</span>
                              <span className="text-xs text-muted-foreground">{m.desc}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Opções avançadas (idioma do roteiro)
          </button>

          {/* Voice Selection — Custom Picker with Play Preview */}
          <FormField
            control={form.control}
            name="voice"
            render={({ field }) => (
              <FormItem>
                <div className="border border-border/40 rounded-lg bg-background/30 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold flex items-center gap-1">
                      <Mic className="w-3 h-3" /> Voz da Narração
                    </span>
                    <span className="text-xs text-primary/70 font-mono">
                      {ELEVENLABS_VOICES.find(v => v.id === field.value)?.name ??
                       GEMINI_TTS_VOICES.find(v => v.id === field.value)?.name ??
                       OPENAI_VOICES.find(v => v.id === field.value)?.name ??
                       elVoices.find(v => v.voice_id === field.value)?.name ??
                       "Selecione uma voz"}
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto">
                    {/* ElevenLabs group */}
                    <div className="px-3 py-1.5 text-[10px] font-mono text-yellow-500/70 uppercase tracking-wider bg-yellow-500/5 border-b border-border/20">
                      ⚡ ElevenLabs — Alta Emoção
                    </div>
                    {ELEVENLABS_VOICES.map((v) => (
                      <VoiceRow
                        key={v.id}
                        id={v.id}
                        name={`${v.flag} ${v.name}`}
                        desc={v.desc}
                        selected={field.value === v.id}
                        playing={playingVoice === v.id}
                        loading={loadingVoice === v.id}
                        onSelect={() => field.onChange(v.id)}
                        onPlay={(e) => handlePlayVoice(v.id, e)}
                      />
                    ))}
                    {/* Browser toggle */}
                    <button
                      type="button"
                      onClick={handleToggleElBrowser}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-mono text-yellow-400/60 hover:text-yellow-400 hover:bg-yellow-500/5 transition-all border-b border-border/20"
                    >
                      {showElBrowser ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showElBrowser ? "Fechar catálogo ElevenLabs" : "🔍 Ver TODAS as vozes ElevenLabs"}
                    </button>

                    {/* ElevenLabs full catalogue browser */}
                    {showElBrowser && (
                      <div className="border-b border-border/20 bg-yellow-500/5">
                        {/* Search input */}
                        <div className="px-3 py-2 border-b border-border/10">
                          <input
                            type="text"
                            value={elSearch}
                            onChange={(e) => setElSearch(e.target.value)}
                            placeholder="🔍 Buscar por nome, idioma, gênero, estilo..."
                            className="w-full text-xs bg-background/60 border border-border/40 rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-yellow-500/40 font-mono"
                          />
                        </div>

                        {/* Voice list */}
                        <div className="max-h-64 overflow-y-auto">
                          {elLoading && (
                            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground font-mono">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Carregando catálogo ElevenLabs...
                            </div>
                          )}
                          {elError && (
                            <div className="px-3 py-3 text-xs text-red-400 font-mono">{elError}</div>
                          )}
                          {!elLoading && !elError && elVoices.length === 0 && (
                            <div className="px-3 py-3 text-xs text-muted-foreground font-mono">Nenhuma voz encontrada.</div>
                          )}
                          {!elLoading && elVoices.filter(v => {
                            if (!elSearch.trim()) return true;
                            const q = elSearch.toLowerCase();
                            const labels = v.labels ?? {};
                            return (
                              v.name.toLowerCase().includes(q) ||
                              (labels.gender ?? "").toLowerCase().includes(q) ||
                              (labels.accent ?? "").toLowerCase().includes(q) ||
                              (labels.description ?? "").toLowerCase().includes(q) ||
                              (labels.language ?? "").toLowerCase().includes(q) ||
                              (labels.use_case ?? "").toLowerCase().includes(q) ||
                              v.category.toLowerCase().includes(q)
                            );
                          }).map((v) => {
                            const labels = v.labels ?? {};
                            const genderIcon = labels.gender === "female" ? "♀" : labels.gender === "male" ? "♂" : "○";
                            const isSelected = field.value === v.voice_id;
                            return (
                              <div
                                key={v.voice_id}
                                onClick={() => field.onChange(v.voice_id)}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-all border-b border-border/10 last:border-0 ${
                                  isSelected
                                    ? "bg-yellow-500/10 border-l-2 border-l-yellow-400"
                                    : "hover:bg-muted/30 border-l-2 border-l-transparent"
                                }`}
                              >
                                <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? "bg-yellow-400" : "bg-muted-foreground/20"}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-medium text-foreground truncate">{genderIcon} {v.name}</span>
                                    {v.category !== "premade" && (
                                      <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1 py-0.5 rounded font-mono">{v.category}</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {labels.language && <span className="text-[9px] bg-blue-500/10 text-blue-300/70 px-1 rounded font-mono">{labels.language}</span>}
                                    {labels.accent && <span className="text-[9px] text-muted-foreground/50 font-mono">{labels.accent}</span>}
                                    {labels.description && <span className="text-[9px] text-muted-foreground/40 font-mono">{labels.description}</span>}
                                    {labels.use_case && <span className="text-[9px] bg-green-500/10 text-green-300/60 px-1 rounded font-mono">{labels.use_case}</span>}
                                  </div>
                                </div>
                                {/* Play from preview_url */}
                                {v.preview_url && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (playingVoice === v.voice_id) {
                                        audioRef.current?.pause();
                                        audioRef.current = null;
                                        setPlayingVoice(null);
                                      } else {
                                        audioRef.current?.pause();
                                        audioRef.current = null;
                                        setPlayingVoice(null);
                                        const audio = new Audio(v.preview_url);
                                        audioRef.current = audio;
                                        setPlayingVoice(v.voice_id);
                                        audio.onended = () => setPlayingVoice(null);
                                        audio.onerror = () => setPlayingVoice(null);
                                        audio.play().catch(() => setPlayingVoice(null));
                                      }
                                    }}
                                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                      playingVoice === v.voice_id
                                        ? "bg-yellow-400/20 text-yellow-400"
                                        : "bg-muted/30 text-muted-foreground hover:bg-yellow-400/10 hover:text-yellow-400"
                                    }`}
                                  >
                                    {playingVoice === v.voice_id ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Gemini group */}
                    <div className="px-3 py-1.5 text-[10px] font-mono text-blue-400/70 uppercase tracking-wider bg-blue-400/5 border-y border-border/20">
                      🔵 Google Gemini TTS
                    </div>
                    {GEMINI_TTS_VOICES.map((v) => (
                      <VoiceRow
                        key={v.id}
                        id={v.id}
                        name={v.name}
                        desc={v.desc}
                        selected={field.value === v.id}
                        playing={playingVoice === v.id}
                        loading={loadingVoice === v.id}
                        onSelect={() => field.onChange(v.id)}
                        onPlay={(e) => handlePlayVoice(v.id, e)}
                      />
                    ))}

                    {/* OpenAI group */}
                    <div className="px-3 py-1.5 text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider bg-muted/10 border-y border-border/20">
                      OpenAI TTS
                    </div>
                    {OPENAI_VOICES.map((v) => (
                      <VoiceRow
                        key={v.id}
                        id={v.id}
                        name={v.name}
                        desc={v.desc}
                        selected={field.value === v.id}
                        playing={playingVoice === v.id}
                        loading={loadingVoice === v.id}
                        onSelect={() => field.onChange(v.id)}
                        onPlay={(e) => handlePlayVoice(v.id, e)}
                        noPreview
                      />
                    ))}
                  </div>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Subtitle Style Picker */}
          <FormField
            control={form.control}
            name="subtitleStyle"
            render={({ field }) => (
              <FormItem>
                <div className="border border-border/40 rounded-lg bg-background/30 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold flex items-center gap-1">
                      💬 Legendas Dinâmicas
                    </span>
                    <span className="text-xs text-primary/70 font-mono">
                      {SUBTITLE_STYLES.find(s => s.value === field.value)?.label ?? "Sem Legenda"}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-px bg-border/20 p-1">
                    {SUBTITLE_STYLES.map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => field.onChange(style.value)}
                        className={`flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 rounded transition-all text-center ${
                          field.value === style.value
                            ? "bg-primary/15 border border-primary/50 shadow-sm"
                            : "bg-background/40 border border-transparent hover:bg-muted/30"
                        }`}
                      >
                        <span className="text-lg leading-none">{style.emoji}</span>
                        <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground leading-tight mt-1">
                          {style.label}
                        </span>
                        <span className={`text-[8px] leading-tight ${style.color} mt-0.5 truncate w-full`}>
                          {style.preview}
                        </span>
                      </button>
                    ))}
                  </div>
                  {field.value !== "none" && (
                    <div className="px-3 py-1.5 border-t border-border/20 bg-primary/5">
                      <p className="text-[10px] text-primary/70 font-mono">
                        ✨ Legendas "{SUBTITLE_STYLES.find(s => s.value === field.value)?.label}" serão queimadas no vídeo automaticamente.
                      </p>
                    </div>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {showAdvanced && (
            <div className="pt-1">
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Idioma do Roteiro</FormLabel>
                    <FormControl>
                      <Input className="font-mono bg-background/50 border-border/50 focus-visible:ring-primary/50 transition-all" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full h-12 font-medium tracking-wide shadow-[0_0_20px_-5px_hsl(var(--primary))] hover:shadow-[0_0_25px_-5px_hsl(var(--primary))] transition-all relative overflow-hidden"
              disabled={createVideo.isPending}
            >
              {createVideo.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  INICIALIZANDO PIPELINE...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-5 w-5" />
                  INICIAR GERAÇÃO
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
