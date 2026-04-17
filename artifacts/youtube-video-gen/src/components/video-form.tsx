import React, { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Zap, Image, Film, ChevronDown, ChevronUp, Mic, FileText, Monitor } from "lucide-react";
import { toast } from "sonner";

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

const OPENAI_VOICES = [
  { id: "onyx",    name: "Onyx",    desc: "Grave e Profundo" },
  { id: "echo",    name: "Echo",    desc: "Masculino" },
  { id: "fable",   name: "Fable",   desc: "Dramático" },
  { id: "alloy",   name: "Alloy",   desc: "Neutro" },
  { id: "nova",    name: "Nova",    desc: "Feminino" },
  { id: "shimmer", name: "Shimmer", desc: "Suave" },
  { id: "ash",     name: "Ash",     desc: "Suave" },
  { id: "ballad",  name: "Ballad",  desc: "Narrativo" },
  { id: "sage",    name: "Sage",    desc: "Sábio" },
  { id: "verse",   name: "Verse",   desc: "Expressivo" },
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

// ─── SCHEMA ───────────────────────────────────────────────────────────────────
const videoFormSchema = z.object({
  topic: z.string().min(3, "O tema é obrigatório").max(200),
  style: z.enum(["curioso", "misterioso", "educativo", "dramático"]),
  durationMinutes: z.coerce.number().min(8).max(15),
  voice: z.string().min(1, "Selecione uma voz"),
  language: z.string().default("pt-BR"),
  platform: z.string().default("youtube"),
  scriptModel: z.string().default("gemini-2.5-flash"),
  imageModel: z.string().default("flux-realism"),
  videoModel: z.string().default("seedance"),
});

type VideoFormValues = z.infer<typeof videoFormSchema>;

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export function VideoForm() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createVideo = useCreateVideo();
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    },
  });

  const onSubmit = (data: VideoFormValues) => {
    createVideo.mutate(
      { data },
      {
        onSuccess: (video) => {
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
          toast.success("Vídeo criado com sucesso!");
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

          {/* Style + Duration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

            <FormField
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Duração (Min)</FormLabel>
                  <FormControl>
                    <Input type="number" min={8} max={15} className="font-mono bg-background/50 border-border/50 focus-visible:ring-primary/50 transition-all" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* AI Models Section */}
          <div className="border border-border/40 rounded-lg p-4 space-y-4 bg-background/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold">Modelos de IA</span>
              <span className="text-xs text-primary/70 font-mono">Gemini + Pollinations</span>
            </div>

            {/* Script Model */}
            <FormField
              control={form.control}
              name="scriptModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Roteiro (LLM)
                  </FormLabel>
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

          {/* Voice Selection */}
          <div className="border border-border/40 rounded-lg p-4 space-y-3 bg-background/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold flex items-center gap-1">
                <Mic className="w-3 h-3" /> Voz da Narração
              </span>
              <span className="text-xs text-yellow-500/80 font-mono">ElevenLabs + Gemini + OpenAI</span>
            </div>

            <FormField
              control={form.control}
              name="voice"
              render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background/50 border-border/50 focus:ring-primary/50 transition-all">
                        <SelectValue placeholder="Selecione a voz" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border max-h-80">
                      <SelectGroup>
                        <SelectLabel className="text-xs text-yellow-500/80 font-mono">⚡ ElevenLabs — Emocional</SelectLabel>
                        {ELEVENLABS_VOICES.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{v.flag} {v.name}</span>
                              <span className="text-xs text-muted-foreground">{v.desc}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-xs text-blue-400/80 font-mono">🔵 Google Gemini TTS</SelectLabel>
                        {GEMINI_TTS_VOICES.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{v.name}</span>
                              <span className="text-xs text-muted-foreground">{v.desc}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-xs text-blue-400/80 font-mono">OpenAI TTS</SelectLabel>
                        {OPENAI_VOICES.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{v.name}</span>
                              <span className="text-xs text-muted-foreground">{v.desc}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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
