import { VideoForm } from "@/components/video-form";
import { VideoList } from "@/components/video-list";
import { Activity } from "lucide-react";

export default function Home() {
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
        
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium tracking-tight">Histórico de Gerações</h2>
            <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              SISTEMA ONLINE
            </div>
          </div>
          
          <VideoList />
        </div>
      </div>
    </div>
  );
}
