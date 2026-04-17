import { useListVideos } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Play, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const { data: videos, isLoading } = useListVideos({
    query: {
      refetchInterval: 3000,
    },
  });

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
            <Card className="p-4 bg-card/40 border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">{video.topic}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-mono">
                    <span>{format(new Date(video.createdAt), "dd/MM HH:mm", { locale: ptBR })}</span>
                    <span>•</span>
                    <span>{video.durationMinutes} MIN</span>
                    <span>•</span>
                    <span className="uppercase">{video.style}</span>
                  </div>
                </div>
                <div className="shrink-0 ml-4">
                  {getStatusBadge(video.status)}
                </div>
              </div>
            </Card>
          </div>
        </Link>
      ))}
    </div>
  );
}
