import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListVideosQueryKey } from "@workspace/api-client-react";
import { VideoForm } from "@/components/video-form";
import { VideoList } from "@/components/video-list";
import { Activity, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function Home() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClearAll = async () => {
    if (!confirming) { setConfirming(true); return; }
    try {
      setClearing(true);
      await fetch(`${BASE_URL}/api/videos`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      toast.success("Histórico limpo com sucesso.");
    } catch {
      toast.error("Erro ao limpar histórico.");
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-12">
      <header className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter flex items-center gap-3">
          <Activity className="w-8 h-8 text-primary" />
          YOUTUBE<span className="text-primary">GEN</span> STUDIO
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">PIPELINE AUTÔNOMO DE GERAÇÃO DE VÍDEOS v1.0</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <VideoForm />
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium tracking-tight">Histórico de Gerações</h2>
            <div className="flex items-center gap-3">
              {confirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive font-mono flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Confirmar?
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={handleClearAll}
                    disabled={clearing}
                  >
                    {clearing ? "Limpando..." : "Sim, limpar tudo"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setConfirming(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                  onClick={handleClearAll}
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar Histórico
                </Button>
              )}
              <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                SISTEMA ONLINE
              </div>
            </div>
          </div>

          <VideoList />
        </div>
      </div>
    </div>
  );
}
