import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { useGetVideo, getGetVideoQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Download, Terminal, CheckCircle2, AlertCircle, Loader2, Clock } from "lucide-react";
import { format } from "date-fns";

type LogEntry = {
  id: string;
  timestamp: string;
  step: string;
  message: string;
  progress: number;
};

export default function VideoDetail() {
  const { id } = useParams();
  const videoId = Number(id);
  const queryClient = useQueryClient();
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: video, isLoading } = useGetVideo(videoId, {
    query: {
      enabled: !!videoId,
      queryKey: getGetVideoQueryKey(videoId),
      refetchInterval: (query) => {
        const state = query.state.data;
        if (state && state.status !== "done" && state.status !== "error" && !isGenerating) {
          return 3000;
        }
        return false;
      },
    },
  });

  const startGeneration = async () => {
    if (!video || isGenerating) return;
    
    setIsGenerating(true);
    setLogs((prev) => [...prev, { id: crypto.randomUUID(), timestamp: new Date().toISOString(), step: "init", message: "Connecting to generation pipeline...", progress: 0 }]);

    try {
      const response = await fetch(`/api/videos/${video.id}/generate`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                setLogs((prev) => [...prev, {
                  id: crypto.randomUUID(),
                  timestamp: new Date().toISOString(),
                  step: data.step || "unknown",
                  message: data.message || "Processing...",
                  progress: data.progress || 0
                }]);
                
                queryClient.setQueryData(getGetVideoQueryKey(videoId), (old: any) => {
                  if (!old) return old;
                  return {
                    ...old,
                    progress: data.progress || old.progress,
                    status: data.step === "done" ? "done" : data.step === "error" ? "error" : data.step || old.status,
                  };
                });
                
                if (data.step === "done" || data.step === "error") {
                  done = true;
                }
              } catch (e) {
                // ignore
              }
            }
          }
        }
      }
    } catch (err) {
      setLogs((prev) => [...prev, { id: crypto.randomUUID(), timestamp: new Date().toISOString(), step: "error", message: "Connection lost or generation failed.", progress: 0 }]);
    } finally {
      setIsGenerating(false);
      queryClient.invalidateQueries({ queryKey: getGetVideoQueryKey(videoId) });
    }
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-2xl font-bold">Video not found</h2>
        <Link href="/">
          <Button variant="link" className="mt-4">Return Home</Button>
        </Link>
      </div>
    );
  }

  const isDone = video.status === "done";
  const isError = video.status === "error";
  const isPending = video.status === "pending";
  const currentProgress = video.progress || 0;

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 -ml-3 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Studio
        </Button>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6 bg-card/40 border-border/50 shadow-xl backdrop-blur-sm">
            <h1 className="text-xl font-bold mb-4 line-clamp-2" title={video.topic}>{video.topic}</h1>
            
            <div className="space-y-4 text-sm font-mono">
              <div>
                <div className="text-muted-foreground text-xs uppercase mb-1">Status</div>
                <div className="flex items-center gap-2">
                  {isDone ? (
                    <span className="text-emerald-500 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> DONE</span>
                  ) : isError ? (
                    <span className="text-destructive flex items-center gap-2"><AlertCircle className="w-4 h-4" /> ERROR</span>
                  ) : isPending ? (
                    <span className="text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> PENDING</span>
                  ) : (
                    <span className="text-primary flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {video.status.toUpperCase()}</span>
                  )}
                </div>
              </div>
              
              <div>
                <div className="text-muted-foreground text-xs uppercase mb-1">Created</div>
                <div>{format(new Date(video.createdAt), "yyyy-MM-dd HH:mm:ss")}</div>
              </div>
              
              <div>
                <div className="text-muted-foreground text-xs uppercase mb-1">Parameters</div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-background/50 p-2 rounded border border-border/50 text-center">{video.style}</div>
                  <div className="bg-background/50 p-2 rounded border border-border/50 text-center">{video.durationMinutes}m</div>
                  <div className="bg-background/50 p-2 rounded border border-border/50 text-center">{video.voice}</div>
                  <div className="bg-background/50 p-2 rounded border border-border/50 text-center">{video.language}</div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              {isPending && (
                <Button 
                  onClick={startGeneration} 
                  disabled={isGenerating}
                  className="w-full h-12 shadow-[0_0_15px_-3px_hsl(var(--primary))]"
                >
                  {isGenerating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> STARTING...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> START GENERATION</>
                  )}
                </Button>
              )}
              
              {isDone && (
                <a href={`/api/videos/${video.id}/download`} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_0_15px_-3px_rgb(5,150,105)]">
                    <Download className="w-4 h-4 mr-2" />
                    DOWNLOAD VIDEO
                  </Button>
                </a>
              )}
              
              {isError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm mt-4">
                  {video.errorMessage || "An unknown error occurred during generation."}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-[600px] flex flex-col bg-[#0a0a0c] border-border/50 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-border/50">
              <div 
                className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_10px_hsl(var(--primary))]" 
                style={{ width: `${currentProgress}%` }}
              />
            </div>
            
            <div className="p-4 border-b border-border/50 bg-card/80 flex items-center justify-between z-10">
              <div className="flex items-center gap-2 text-sm font-mono">
                <Terminal className="w-4 h-4 text-muted-foreground" />
                <span>TERMINAL OUTPUT</span>
              </div>
              <div className="text-xs font-mono text-primary">{currentProgress}% COMPLETE</div>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs md:text-sm space-y-2 z-10">
              {logs.length === 0 && !isGenerating && video.status === "pending" && (
                <div className="text-muted-foreground/50 h-full flex items-center justify-center italic">
                  Waiting to initialize...
                </div>
              )}
              
              {logs.map((log) => (
                <div key={log.id} className="flex gap-4">
                  <span className="text-muted-foreground/40 shrink-0">
                    {format(new Date(log.timestamp), "HH:mm:ss.SSS")}
                  </span>
                  <span className={`${log.step === "error" ? "text-destructive" : log.step === "done" ? "text-emerald-400" : "text-foreground"}`}>
                    [{log.step.toUpperCase()}] {log.message}
                  </span>
                </div>
              ))}
              
              {video.status !== "pending" && video.status !== "error" && logs.length === 0 && (
                <div className="flex gap-4">
                  <span className="text-primary">
                    [SYSTEM] Job was started externally or previously. Reconnecting to logs not supported for past jobs. View current progress above.
                  </span>
                </div>
              )}
              
              <div ref={logsEndRef} />
            </div>
            
            <div className="absolute bottom-[-100px] right-[-100px] w-64 h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
