import { useState } from "react";
import { useListVideos, getListVideosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Play, Clock, CheckCircle2, AlertCircle, Loader2, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STATUS_LABELS: Record<string, string> = {
  pending: "AGUARDANDO",
  generating_script: "GERANDO ROTEIRO",
  generating_audio: "GERANDO ÁUDIO",
  generating_images: "GERANDO IMAGENS",
  generating_clips: "GERANDO CLIPES (RUNWAY)",
  assembling: "MONTANDO VÍDEO",
  assembling_video: "MONTANDO VÍDEO",
  done: "CONCLUÍDO",
  error: "FALHOU",
};

export function VideoList() {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const { data: videos, isLoading } = useListVideos({
    query: {
      refetchInterval: 3000,
    },
  });

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }

    try {
      setDeletingId(id);
      setConfirmId(null);
      await fetch(`${BASE_URL}/api/videos/${id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      toast.success("Vídeo removido do histórico.");
    } catch {
      toast.error("Erro ao remover vídeo.");
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 animate-pulse bg-card/50">
            <div className="h-5 bg-muted rounded w-1/3 mb-3"></div>
            <div className="h-4 bg-muted rounded w-1/4"></div>
          </Card>
        ))}
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed border-border/50 rounded-xl bg-card/30">
        <Play className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-50" />
        <h3 className="text-lg font-medium text-foreground">Nenhum vídeo ainda</h3>
        <p className="text-sm text-muted-foreground mt-1">Inicie sua primeira geração acima.</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const label = STATUS_LABELS[status] ?? status.replace("_", " ").toUpperCase();
    switch (status) {
      case "done":
        return <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> {label}</Badge>;
      case "error":
        return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20"><AlertCircle className="w-3 h-3 mr-1" /> {label}</Badge>;
      case "pending":
        return <Badge variant="secondary" className="bg-secondary/50 text-muted-foreground"><Clock className="w-3 h-3 mr-1" /> {label}</Badge>;
      default:
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> {label}</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      {videos.map((video) => (
        <Link key={video.id} href={`/videos/${video.id}`}>
          <div className="block group cursor-pointer">
            <Card className="p-4 bg-card/40 border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all relative">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1 pr-2">{video.topic}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-mono flex-wrap">
                    <span>{format(new Date(video.createdAt), "dd/MM HH:mm", { locale: ptBR })}</span>
                    <span>•</span>
                    <span>{video.durationMinutes} MIN</span>
                    <span>•</span>
                    <span className="uppercase">{video.style}</span>
                    {video.platform && (
                      <>
                        <span>•</span>
                        <span className="uppercase">{video.platform}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {getStatusBadge(video.status)}

                  {confirmId === video.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                      <button
                        onClick={(e) => handleDelete(video.id, e)}
                        disabled={deletingId === video.id}
                        className="text-xs text-destructive border border-destructive/30 rounded px-1.5 py-0.5 hover:bg-destructive/10 transition-colors font-mono"
                      >
                        {deletingId === video.id ? "..." : "Excluir"}
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(null); }}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handleDelete(video.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-destructive p-1 rounded"
                      title="Remover do histórico"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </Link>
      ))}
    </div>
  );
}
