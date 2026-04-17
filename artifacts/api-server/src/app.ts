import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { like } from "drizzle-orm";
import { db } from "@workspace/db";
import { videosTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import fs from "fs";
import path from "path";
import os from "os";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// On startup, reset any jobs that were left in a generating_* state
// (they were orphaned by a previous server restart mid-pipeline)
async function resetStuckJobs(): Promise<void> {
  try {
    const stuck = await db
      .select({ id: videosTable.id, status: videosTable.status })
      .from(videosTable)
      .where(like(videosTable.status, "generating_%"));

    if (stuck.length > 0) {
      // FIX L-01: limpar workDir temporário para evitar arquivos parciais na re-geração
      for (const job of stuck) {
        const workDir = path.join(os.tmpdir(), "yt-video-gen", String(job.id));
        try {
          if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
        } catch { /* non-fatal */ }
      }

      await db
        .update(videosTable)
        .set({
          status: "pending",
          progress: 0,
          errorMessage: "Geração interrompida por reinicialização do servidor. Clique em Gerar para tentar novamente.",
          updatedAt: new Date(),
        })
        .where(like(videosTable.status, "generating_%"));

      logger.info({ count: stuck.length }, "Reset stuck generating jobs to pending");
    }
  } catch (err) {
    logger.error({ err }, "Failed to reset stuck jobs on startup");
  }
}

resetStuckJobs();

export default app;
