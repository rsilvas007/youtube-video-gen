import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  style: text("style").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(8),
  voice: text("voice").notNull().default("alloy"),
  language: text("language").notNull().default("pt-BR"),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  errorMessage: text("error_message"),
  outputPath: text("output_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videosTable).omit({
  id: true,
  status: true,
  progress: true,
  errorMessage: true,
  outputPath: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videosTable.$inferSelect;
