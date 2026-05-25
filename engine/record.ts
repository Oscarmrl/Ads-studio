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

  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Reset base */
      body, html {
        margin: 0 !important; padding: 0 !important;
        overflow: hidden !important;
        width: 100vw !important; height: 100vh !important;
      }
      /* Ocultar controles de preview que no son parte del anuncio */
      #bar, .preview-bar, [class*="control-bar"] {
        display: none !important;
      }
      /* Stage: llenar todo el viewport sin restricciones */
      #stage {
        width: 100vw !important; height: 100vh !important;
        max-width: none !important; max-height: none !important;
        flex: none !important;
        position: relative !important;
      }
      /* SVG: llenar el stage sin caps de tamaño */
      #stage svg, #stage > svg {
        width: 100% !important; height: 100% !important;
        max-width: none !important; max-height: none !important;
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  });

  const fileUrl = `file:///${absHtml.replace(/\\/g, '/')}`;
  onProgress(`  Cargando: ${path.basename(htmlPath)}`);

  // Esperamos 'load' — aquí arrancan las animaciones CSS y los scripts JS
  await page.goto(fileUrl, { waitUntil: 'load' });

  // Pausa mínima para que los handlers asíncronos del load terminen
  await page.waitForTimeout(5);

  // ── Blank medido: desde que empezó a grabar hasta que la animación arrancó
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
