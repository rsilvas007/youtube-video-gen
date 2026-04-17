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
import { Loader2, Plus, Zap, Image, Film, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const IMAGE_MODELS = [
  { value: "flux",            label: "Flux Schnell",         desc: "Rápido, qualidade alta" },
  { value: "flux-realism",    label: "Flux Realism",         desc: "Hiper-realista" },
  { value: "flux-cinematic",  label: "Flux Cinematic",       desc: "Estilo cinematográfico" },
  { value: "flux-pro",        label: "Flux Pro",             desc: "Máxima qualidade Flux" },
  { value: "kontext",         label: "FLUX.1 Kontext",       desc: "Edição contextual avançada" },
  { value: "klein",           label: "FLUX.2 Klein 4B",      desc: "Rápido com edição" },
  { value: "zimage",          label: "Z-Image Turbo",        desc: "Flux 6B + upscale 2x" },
  { value: "gptimage",        label: "GPT Image 1 Mini",     desc: "OpenAI Mini" },
  { value: "gptimage-large",  label: "GPT Image 1.5",        desc: "OpenAI avançado" },
  { value: "nanobanana",      label: "NanoBanana",           desc: "Gemini 2.5 Flash" },
  { value: "nanobanana-2",    label: "NanoBanana 2",         desc: "Gemini 3.1 Flash" },
  { value: "nanobanana-pro",  label: "NanoBanana Pro",       desc: "Gemini 3 Pro 4K" },
  { value: "seedream5",       label: "Seedream 5.0",         desc: "ByteDance ARK" },
  { value: "wan-image",       label: "Wan 2.7 Image",        desc: "Alibaba até 2K" },
  { value: "wan-image-pro",   label: "Wan 2.7 Image Pro",    desc: "Alibaba 4K + thinking" },
  { value: "qwen-image",      label: "Qwen Image Plus",      desc: "Alibaba DashScope" },
  { value: "grok-imagine",    label: "Grok Imagine",         desc: "xAI oficial" },
  { value: "grok-imagine-pro",label: "Grok Imagine Pro",     desc: "xAI Aurora Pro" },
  { value: "nova-canvas",     label: "Nova Canvas",          desc: "Amazon Bedrock" },
  { value: "p-image",         label: "p-image (Pruna)",      desc: "Rápido text-to-image" },
];

const VIDEO_MODELS = [
  { value: "seedance",        label: "Seedance Lite",        desc: "BytePlus — qualidade alta" },
  { value: "seedance-pro",    label: "Seedance Pro-Fast",    desc: "BytePlus — melhor aderência" },
  { value: "wan-fast",        label: "Wan 2.2 Fast",         desc: "Alibaba — rápido 480P 5s" },
  { value: "wan",             label: "Wan 2.6",              desc: "Alibaba — 1080P 2-15s + áudio" },
  { value: "veo",             label: "Veo 3.1 Fast",         desc: "Google — preview" },
  { value: "grok-video-pro",  label: "Grok Video Pro",       desc: "xAI — 720p 1-15s" },
  { value: "ltx-2",           label: "LTX-2.3",              desc: "Rápido + upscaler" },
  { value: "p-video",         label: "p-video (Pruna)",      desc: "Text/image-to-video 1080p" },
  { value: "nova-reel",       label: "Nova Reel",            desc: "Amazon Bedrock 720p 6-60s" },
];

const videoFormSchema = z.object({
  topic: z.string().min(3, "O tema é obrigatório").max(200),
  style: z.enum(["curioso", "misterioso", "educativo", "dramático"]),
  durationMinutes: z.coerce.number().min(8).max(15),
  voice: z.enum(["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"]),
  language: z.string().default("pt-BR"),
  imageModel: z.string().default("flux-realism"),
  videoModel: z.string().default("seedance"),
});

type VideoFormValues = z.infer<typeof videoFormSchema>;

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
      voice: "onyx",
      language: "pt-BR",
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

          {/* Model Selection */}
          <div className="border border-border/40 rounded-lg p-4 space-y-4 bg-background/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold">Modelos de IA</span>
              <span className="text-xs text-primary/70 font-mono">Pollinations.ai</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                      <SelectContent className="bg-popover border-border max-h-72">
                        {IMAGE_MODELS.map((m) => (
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

          {/* Advanced options toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Opções avançadas (voz, idioma)
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
              <FormField
                control={form.control}
                name="voice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Voz</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 border-border/50 focus:ring-primary/50 transition-all">
                          <SelectValue placeholder="Selecione a voz" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="alloy">Alloy — neutro</SelectItem>
                        <SelectItem value="ash">Ash — suave</SelectItem>
                        <SelectItem value="ballad">Ballad — narrativo</SelectItem>
                        <SelectItem value="coral">Coral — caloroso</SelectItem>
                        <SelectItem value="echo">Echo — masculino</SelectItem>
                        <SelectItem value="fable">Fable — dramático</SelectItem>
                        <SelectItem value="onyx">Onyx — grave</SelectItem>
                        <SelectItem value="nova">Nova — feminino</SelectItem>
                        <SelectItem value="sage">Sage — sábio</SelectItem>
                        <SelectItem value="shimmer">Shimmer — suave</SelectItem>
                        <SelectItem value="verse">Verse — expressivo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Idioma</FormLabel>
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
