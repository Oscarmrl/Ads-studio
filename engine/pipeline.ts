// engine/pipeline.ts — orquestador: HTML → video raw → MP4 mobile + desktop
import path from 'path';
import fs from 'fs';
import { record } from './record';
import { mix } from './mix';
import type { AudioCue } from './mix';

// Resoluciones estándar de exportación
// Mobile  9:16  → Stories, Reels, TikTok
// Desktop 16:9  → YouTube, Facebook, LinkedIn, presentaciones
const FORMAT_MOBILE  = { width: 1080, height: 1920, label: 'mobile',  tag: '📱 1080×1920' };
const FORMAT_DESKTOP = { width: 1920, height: 1080, label: 'desktop', tag: '🖥️ 1920×1080' };

export interface PipelineConfig {
  html: string;       // ruta al HTML (relativa al baseDir o absoluta)
  duration: number;
  width?: number;
  height?: number;
  voice?: AudioCue[];
  sfx?: AudioCue[];
}

export interface PipelineResult {
  mobileFile: string;   // nombre del MP4 mobile  (1080×1920  — Stories / Reels)
  desktopFile: string;  // nombre del MP4 desktop (1920×1080  — YouTube / FB / LI)
}

export interface PipelineOptions {
  config: PipelineConfig;
  baseDir: string;    // directorio raíz del proyecto (donde están uploads/, data/)
  onProgress?: (step: string, detail: string) => void;
}

export async function runPipeline({
  config,
  baseDir,
  onProgress = (s, d) => console.log(`[${s}] ${d}`),
}: PipelineOptions): Promise<PipelineResult> {

  const htmlPath  = path.isAbsolute(config.html)
    ? config.html
    : path.resolve(baseDir, 'public', 'ads', config.html);

  const baseName  = path.basename(config.html, '.html');
  const outputDir = path.join(baseDir, 'data', 'outputs');
  const rawVideo  = path.join(outputDir, `${baseName}_raw_${Date.now()}.webm`);

  fs.mkdirSync(outputDir, { recursive: true });

  onProgress('info', `▶ Pipeline: ${path.basename(config.html)}`);
  onProgress('info', `  Duración: ${config.duration}s`);
  onProgress('info', `  Voz: ${(config.voice || []).length} pistas | SFX: ${(config.sfx || []).length} cues`);
  onProgress('info', `  Tamaño fuente: ${config.width || 1080}×${config.height || 1080}px`);

  // ── Paso 1: grabar en las dimensiones nativas del HTML ─────────────────────
  // Grabando al tamaño exacto del HTML garantiza que la animación llene
  // el viewport completamente sin barras negras. FFmpeg escala después.
  onProgress('record', 'Paso 1/3 — Grabando video con Playwright...');
  const { blankSeconds } = await record({
    htmlPath,
    outputPath: rawVideo,
    durationSeconds: config.duration + 1,
    width:  config.width  || 1080,
    height: config.height || 1080,
    onProgress: (msg) => onProgress('record', msg),
  });

  const mixBase = {
    videoPath:   rawVideo,
    baseDir:     path.join(baseDir, 'uploads'),
    duration:    config.duration,
    videoOffset: blankSeconds,
    voice: config.voice || [],
    sfx:   config.sfx   || [],
  };

  // ── Paso 2: MP4 mobile — 1080×1920 (Story 9:16) ───────────────────────────
  const mobileMp4 = path.join(outputDir, `${baseName}_mobile.mp4`);
  onProgress('mix', `Paso 2/3 — Exportando ${FORMAT_MOBILE.tag}...`);
  mix({
    ...mixBase,
    outputPath:   mobileMp4,
    outputWidth:  FORMAT_MOBILE.width,
    outputHeight: FORMAT_MOBILE.height,
    onProgress:   (msg) => onProgress('mix', msg),
  });

  // ── Paso 3: MP4 desktop — 1920×1080 (16:9 horizontal) ───────────────────
  const desktopMp4 = path.join(outputDir, `${baseName}_desktop.mp4`);
  onProgress('mix', `Paso 3/3 — Exportando ${FORMAT_DESKTOP.tag}...`);
  mix({
    ...mixBase,
    outputPath:   desktopMp4,
    outputWidth:  FORMAT_DESKTOP.width,
    outputHeight: FORMAT_DESKTOP.height,
    onProgress:   (msg) => onProgress('mix', msg),
  });

  // ── Limpieza del raw ───────────────────────────────────────────────────────
  if (fs.existsSync(rawVideo)) fs.unlinkSync(rawVideo);

  const mobileFile  = path.basename(mobileMp4);
  const desktopFile = path.basename(desktopMp4);

  onProgress('done', `✓ Mobile:  ${mobileFile}`);
  onProgress('done', `✓ Desktop: ${desktopFile}`);

  return { mobileFile, desktopFile };
}
