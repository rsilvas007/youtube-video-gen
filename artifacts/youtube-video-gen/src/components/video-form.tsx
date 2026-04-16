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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Zap } from "lucide-react";
import { toast } from "sonner";

const videoFormSchema = z.object({
  topic: z.string().min(3, "Topic is required").max(100),
  style: z.enum(["curioso", "misterioso", "educativo", "dramático"]),
  durationMinutes: z.coerce.number().min(8).max(15),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]),
  language: z.string().default("pt-BR"),
});

type VideoFormValues = z.infer<typeof videoFormSchema>;

export function VideoForm() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createVideo = useCreateVideo();

  const form = useForm<VideoFormValues>({
    resolver: zodResolver(videoFormSchema),
    defaultValues: {
      topic: "",
      style: "curioso",
      durationMinutes: 10,
      voice: "onyx",
      language: "pt-BR",
    },
  });

  const onSubmit = (data: VideoFormValues) => {
    createVideo.mutate(
      { data },
      {
        onSuccess: (video) => {
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
          toast.success("Video job created!");
          setLocation(`/videos/${video.id}`);
        },
        onError: () => {
          toast.error("Failed to create video job");
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
          New Generation
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Configure pipeline parameters.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="topic"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Topic</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. History of Quantum Mechanics" className="font-medium bg-background/50 border-border/50 focus-visible:ring-primary/50 transition-all" {...field} />
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
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Style</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background/50 border-border/50 focus:ring-primary/50 transition-all">
                        <SelectValue placeholder="Select style" />
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
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Duration (Min)</FormLabel>
                  <FormControl>
                    <Input type="number" min={8} max={15} className="font-mono bg-background/50 border-border/50 focus-visible:ring-primary/50 transition-all" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField
              control={form.control}
              name="voice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Voice Profile</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background/50 border-border/50 focus:ring-primary/50 transition-all">
                        <SelectValue placeholder="Select voice" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="alloy">Alloy</SelectItem>
                      <SelectItem value="echo">Echo</SelectItem>
                      <SelectItem value="fable">Fable</SelectItem>
                      <SelectItem value="onyx">Onyx</SelectItem>
                      <SelectItem value="nova">Nova</SelectItem>
                      <SelectItem value="shimmer">Shimmer</SelectItem>
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
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Language</FormLabel>
                  <FormControl>
                    <Input className="font-mono bg-background/50 border-border/50 focus-visible:ring-primary/50 transition-all" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full h-12 font-medium tracking-wide shadow-[0_0_20px_-5px_hsl(var(--primary))] hover:shadow-[0_0_25px_-5px_hsl(var(--primary))] transition-all relative overflow-hidden"
              disabled={createVideo.isPending}
            >
              {createVideo.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  INITIALIZING PIPELINE...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-5 w-5" />
                  INITIALIZE GENERATION
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
