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
  onProgress = console.log,
}: MixOptions): string {
  const absVideo  = path.resolve(videoPath);
  const absOutput = path.resolve(outputPath);

  // Redondeamos a 3 decimales para el filtro FFmpeg
  const trimStart = Math.max(0, parseFloat(videoOffset.toFixed(3)));
  const hasTrim   = trimStart > 0;

  const allCues = [
    ...voice.map(c => ({ at: c.at, src: path.resolve(baseDir, c.src), vol: c.vol ?? 0.92 })),
    ...sfx.map(c =>   ({ at: c.at, src: path.resolve(baseDir, c.src), vol: c.vol ?? 0.65 })),
  ];

  const args: string[] = ['-y', '-i', absVideo];

  // ── Sin audio ─────────────────────────────────────────────────────────────
  if (allCues.length === 0) {
    if (hasTrim) {
      args.push('-vf', `trim=start=${trimStart},setpts=PTS-STARTPTS`);
    }
    if (duration) args.push('-t', String(duration));
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

  // Recorte del video si hay blank inicial
  let videoMapLabel = '0:v';
  if (hasTrim) {
    filterParts.push(
      `[0:v]trim=start=${trimStart},setpts=PTS-STARTPTS[vtrimmed]`
    );
    videoMapLabel = '[vtrimmed]';
  }

  // Filtros de audio (adelay ajustado para compensar el recorte del video)
  allCues.forEach((cue, i) => {
    const inputIdx = i + 1;
    // adelay ya incluye el offset de la cue; el video se recorta,
    // así que los tiempos de audio quedan en sincronía natural.
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

  onProgress(`  Mezclando ${n} pistas de audio (recortando ${trimStart}s de blank)...`);
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
