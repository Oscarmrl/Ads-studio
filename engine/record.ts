// engine/record.ts — graba una animación HTML como video usando Playwright headless
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

export interface RecordOptions {
  htmlPath: string;
  outputPath: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  onProgress?: (msg: string) => void;
}

export interface RecordResult {
  path: string;
  /** Segundos de pantalla en blanco al inicio del .webm (antes de que arranque la animación) */
  blankSeconds: number;
}

// ── Calidad de rendering ──────────────────────────────────────────────────────
// deviceScaleFactor: 2 = modo Retina / HiDPI.
// El viewport CSS permanece en sus dimensiones originales (p.ej. 1600×1000),
// pero Chromium activa su pipeline de renderizado de alta densidad:
//   • Subpixel antialiasing para texto e íconos
//   • Curvas SVG renderizadas a resolución 2× antes de compositar
//   • Gradientes calculados con mayor precisión
// El video se captura igual en píxeles CSS; la ganancia es de calidad, no de tamaño.
const DEVICE_SCALE = 2;

// CSS que se inyecta en cada ad para:
//   • eliminar márgenes / scroll del body
//   • ocultar controles de preview (#bar)
//   • forzar que #stage llene 100 % del viewport
//   • forzar que el SVG dentro de #stage llene 100 % del stage
//     (usando position:absolute para evitar problemas de flexbox con height:100%)
const OVERRIDE_CSS = `
  body, html {
    margin: 0 !important; padding: 0 !important;
    overflow: hidden !important;
    width: 100vw !important; height: 100vh !important;
  }
  /* Controles de preview — no deben aparecer en el video */
  #bar, .preview-bar, [class*="control-bar"] {
    display: none !important;
  }
  /* Stage ocupa todo el viewport */
  #stage {
    position: relative !important;
    width: 100vw !important; height: 100vh !important;
    max-width: none !important; max-height: none !important;
    flex: none !important;
  }
  /* SVG con position:absolute llena el stage independientemente de flexbox */
  #stage svg, #stage > svg {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important; height: 100% !important;
    max-width: none !important; max-height: none !important;
    display: block !important;
  }
`;

export async function record({
  htmlPath,
  outputPath,
  durationSeconds,
  width = 1280,
  height = 800,
  onProgress = console.log,
}: RecordOptions): Promise<RecordResult> {
  const absHtml   = path.resolve(htmlPath);
  const absOutput = path.resolve(outputPath);
  const tmpDir    = path.join(path.dirname(absOutput), `_rec_tmp_${Date.now()}`);

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });

  const browser = await chromium.launch({
    args: [
      // Perfil de color sRGB consistente — evita shifts de color entre OS
      '--force-color-profile=srgb',
      // Deshabilitar throttling de FPS en headless para animaciones más suaves
      '--disable-frame-rate-limit',
    ],
  });

  // ── t0: el contexto con recordVideo ya empieza a grabar ──────────────────
  const t0 = Date.now();

  const context = await browser.newContext({
    viewport:         { width, height },
    deviceScaleFactor: DEVICE_SCALE,          // Renderizado Retina / HiDPI
    recordVideo:      { dir: tmpDir, size: { width, height } },
  });

  const page = await context.newPage();

  const fileUrl = `file:///${absHtml.replace(/\\/g, '/')}`;
  onProgress(`  Cargando: ${path.basename(htmlPath)} (HiDPI ×${DEVICE_SCALE})`);

  // Esperamos 'load' — aquí arrancan las animaciones CSS y los scripts JS
  await page.goto(fileUrl, { waitUntil: 'load' });

  // Inyectar CSS DESPUÉS de que la página cargue:
  // • page.addStyleTag() garantiza que document.head existe y está poblado
  // • Al ser el último <style> en <head>, gana la cascada
  await page.addStyleTag({ content: OVERRIDE_CSS });

  // Pausa para que el browser recalcule layout con el nuevo CSS
  await page.waitForTimeout(80);

  // ── Blank medido: desde que empezó a grabar hasta ahora
  const blankSeconds = (Date.now() - t0) / 1000;
  onProgress(`  Animación activa (blank inicial: ${blankSeconds.toFixed(2)}s — se recortará)`);

  onProgress(`  Grabando ${durationSeconds}s a ${width}×${height} (DPR ${DEVICE_SCALE})...`);
  await page.waitForTimeout(durationSeconds * 1000);

  await page.close();
  const videoPath = await page.video()!.path();
  await context.close();
  await browser.close();

  fs.renameSync(videoPath, absOutput);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  onProgress(`  Video raw guardado: ${path.basename(absOutput)}`);
  return { path: absOutput, blankSeconds };
}
