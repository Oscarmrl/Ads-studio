// engine/pipeline.ts — orquestador: HTML → video raw → MP4 final
import path from 'path';
import fs from 'fs';
import { record } from './record';
import { mix } from './mix';
import type { AudioCue } from './mix';

export interface PipelineConfig {
  html: string;       // ruta al HTML (relativa al baseDir o absoluta)
  duration: number;
  width?: number;
  height?: number;
  voice?: AudioCue[];
  sfx?: AudioCue[];
}

export interface PipelineOptions {
  config: PipelineConfig;
  baseDir: string;    // directorio raíz del proyecto (donde están uploads/, data/)
  outputPath?: string;
  onProgress?: (step: string, detail: string) => void;
}

export async function runPipeline({
  config,
  baseDir,
  outputPath,
  onProgress = (s, d) => console.log(`[${s}] ${d}`),
}: PipelineOptions): Promise<string> {

  const htmlPath  = path.isAbsolute(config.html)
    ? config.html
    : path.resolve(baseDir, 'public', 'ads', config.html);

  const baseName  = path.basename(config.html, '.html');
  const outputDir = path.join(baseDir, 'data', 'outputs');
  const rawVideo  = path.join(outputDir, `${baseName}_raw_${Date.now()}.webm`);
  const finalMp4  = outputPath || path.join(outputDir, `${baseName}.mp4`);

  fs.mkdirSync(outputDir, { recursive: true });

  onProgress('info', `▶ Pipeline: ${path.basename(config.html)}`);
  onProgress('info', `  Duración: ${config.duration}s`);
  onProgress('info', `  Voz: ${(config.voice || []).length} pistas | SFX: ${(config.sfx || []).length} cues`);

  // ── Paso 1: grabar video ───────────────────────────────────────────────────
  onProgress('record', 'Paso 1/2 — Grabando video con Playwright...');
  const { blankSeconds } = await record({
    htmlPath,
    outputPath: rawVideo,
    // Grabamos con 1s extra para asegurarnos de capturar el final de la animación
    durationSeconds: config.duration + 1,
    width:  config.width  || 1280,
    height: config.height || 800,
    onProgress: (msg) => onProgress('record', msg),
  });

  // ── Paso 2: mezclar audio (y recortar el blank inicial) ───────────────────
  onProgress('mix', 'Paso 2/2 — Mezclando audio con FFmpeg...');
  mix({
    videoPath:   rawVideo,
    outputPath:  finalMp4,
    baseDir:     path.join(baseDir, 'uploads'),
    duration:    config.duration,
    videoOffset: blankSeconds,   // ← recorta el blank medido en el paso 1
    voice: config.voice || [],
    sfx:   config.sfx   || [],
    onProgress: (msg) => onProgress('mix', msg),
  });

  // ── Limpieza ──────────────────────────────────────────────────────────────
  if (fs.existsSync(rawVideo)) fs.unlinkSync(rawVideo);

  onProgress('done', `✓ Listo: ${finalMp4}`);
  return finalMp4;
}
