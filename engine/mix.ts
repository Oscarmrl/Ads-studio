// engine/mix.ts — mezcla video raw (WebM) + pistas de audio → MP4 final con FFmpeg
import { spawnSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';

export interface AudioCue {
  at: number;
  src: string;
  vol?: number;
}

export interface MixOptions {
  videoPath: string;
  outputPath: string;
  baseDir?: string;
  duration?: number;
  /** Segundos de blank al inicio del video que deben recortarse (viene de record.blankSeconds) */
  videoOffset?: number;
  voice?: AudioCue[];
  sfx?: AudioCue[];
  /** Resolución de salida. Si se omite, mantiene las dimensiones del video fuente. */
  outputWidth?: number;
  outputHeight?: number;
  onProgress?: (msg: string) => void;
}

export function mix({
  videoPath,
  outputPath,
  baseDir = '.',
  duration,
  videoOffset = 0,
  voice = [],
  sfx = [],
  outputWidth,
  outputHeight,
  onProgress = console.log,
}: MixOptions): string {
  const absVideo  = path.resolve(videoPath);
  const absOutput = path.resolve(outputPath);

  // Redondeamos a 3 decimales para el filtro FFmpeg
  const trimStart = Math.max(0, parseFloat(videoOffset.toFixed(3)));
  const hasTrim   = trimStart > 0;

  // Filtro de escala + letterbox si se especifica resolución de salida
  // lanczos para upscale de calidad; force_original_aspect_ratio=decrease + pad = letterbox sin deformar
  const hasScale = !!(outputWidth && outputHeight);
  const scaleFilter = hasScale
    ? `scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black`
    : null;

  const allCues = [
    ...voice.map(c => ({ at: c.at, src: path.resolve(baseDir, c.src), vol: c.vol ?? 0.92 })),
    ...sfx.map(c =>   ({ at: c.at, src: path.resolve(baseDir, c.src), vol: c.vol ?? 0.65 })),
  ];

  const args: string[] = ['-y', '-i', absVideo];

  // ── Sin audio ─────────────────────────────────────────────────────────────
  if (allCues.length === 0) {
    const vf: string[] = [];
    if (hasTrim)    vf.push(`trim=start=${trimStart},setpts=PTS-STARTPTS`);
    if (scaleFilter) vf.push(scaleFilter);
    if (vf.length)  args.push('-vf', vf.join(','));
    if (duration)   args.push('-t', String(duration));
    args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
              '-movflags', '+faststart', absOutput);
    run(args);
    return absOutput;
  }

  // ── Con audio ─────────────────────────────────────────────────────────────
  allCues.forEach(cue => {
    if (!fs.existsSync(cue.src)) {
      onProgress(`  AVISO: audio no encontrado → ${cue.src}`);
    }
    args.push('-i', cue.src);
  });

  const filterParts: string[] = [];
  const labels: string[] = [];

  // Video: trim + scale en una cadena de filtros
  const vFilters: string[] = [];
  if (hasTrim)    vFilters.push(`trim=start=${trimStart},setpts=PTS-STARTPTS`);
  if (scaleFilter) vFilters.push(scaleFilter);

  let videoMapLabel = '0:v';
  if (vFilters.length) {
    filterParts.push(`[0:v]${vFilters.join(',')}[vout]`);
    videoMapLabel = '[vout]';
  }

  // Filtros de audio
  allCues.forEach((cue, i) => {
    const inputIdx = i + 1;
    const delayMs  = Math.round(cue.at * 1000);
    const label    = `a${i}`;
    filterParts.push(
      `[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${cue.vol}[${label}]`
    );
    labels.push(`[${label}]`);
  });

  const n = allCues.length;
  filterParts.push(
    `${labels.join('')}amix=inputs=${n}:duration=longest:normalize=0[aout]`
  );

  const outputArgs: string[] = [
    '-filter_complex', filterParts.join(';'),
    '-map', videoMapLabel,
    '-map', '[aout]',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
  ];
  if (duration) outputArgs.push('-t', String(duration));
  outputArgs.push(absOutput);

  args.push(...outputArgs);

  const fmt = hasScale ? ` → ${outputWidth}×${outputHeight}` : '';
  onProgress(`  Mezclando ${n} pistas de audio${fmt} (recortando ${trimStart}s de blank)...`);
  run(args);
  onProgress(`  MP4 guardado: ${path.basename(absOutput)}`);
  return absOutput;
}

function run(args: string[]) {
  const result = spawnSync(ffmpegPath as string, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`FFmpeg terminó con código ${result.status}`);
  }
}
