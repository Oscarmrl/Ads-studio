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
    inset: 0 !important;           /* top:0; right:0; bottom:0; left:0 */
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

  const browser = await chromium.launch();

  // ── t0: el contexto con recordVideo ya empieza a grabar ──────────────────
  const t0 = Date.now();

  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: tmpDir, size: { width, height } },
  });

  const page = await context.newPage();

  const fileUrl = `file:///${absHtml.replace(/\\/g, '/')}`;
  onProgress(`  Cargando: ${path.basename(htmlPath)}`);

  // Esperamos 'load' — aquí arrancan las animaciones CSS y los scripts JS
  await page.goto(fileUrl, { waitUntil: 'load' });

  // Inyectar CSS DESPUÉS de que la página cargue:
  // • page.addStyleTag() garantiza que document.head existe y está poblado
  // • Al ser el último <style> en <head>, gana la cascada sin necesidad de !important
  //   (pero lo mantenemos por si el HTML usa !important propio)
  await page.addStyleTag({ content: OVERRIDE_CSS });

  // Pausa para que el browser recalcule layout con el nuevo CSS
  await page.waitForTimeout(80);

  // ── Blank medido: desde que empezó a grabar hasta ahora
  const blankSeconds = (Date.now() - t0) / 1000;
  onProgress(`  Animación activa (blank inicial: ${blankSeconds.toFixed(2)}s — se recortará)`);

  onProgress(`  Grabando ${durationSeconds}s a ${width}x${height}...`);
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
