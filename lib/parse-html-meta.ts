// lib/parse-html-meta.ts
// Extrae dimensiones y duración estimada de un HTML de animación

export interface HtmlMeta {
  width: number;
  height: number;
  duration: number;       // segundos — mejor estimado
  durationSource: string; // de dónde viene el estimado (para debug)
}

export function parseHtmlMeta(html: string): HtmlMeta {
  // ── 1. Dimensiones del body/html ─────────────────────────────────────────
  // Busca: html, body { width: 360px; height: 480px; }
  // o variantes: body { width:270px; height:480px }
  let width = 0;
  let height = 0;

  // ── Estrategia 1: html/body con dimensiones fijas en px ─────────────────
  // Ejemplo: html, body { width: 270px; height: 480px; }
  const dimPatterns = [
    /html\s*,\s*body\s*\{([^}]+)\}/,
    /body\s*,\s*html\s*\{([^}]+)\}/,
    /body\s*\{([^}]+)\}/,
  ];
  for (const pat of dimPatterns) {
    const m = html.match(pat);
    if (m) {
      const block = m[1];
      const w = block.match(/width\s*:\s*(\d+)px/);
      const h = block.match(/height\s*:\s*(\d+)px/);
      if (w) width  = parseInt(w[1]);
      if (h) height = parseInt(h[1]);
      if (w || h) break;
    }
  }

  // ── Estrategia 2: SVG con viewBox (ads tipo #stage svg) ─────────────────
  // Ejemplo: <svg viewBox="0 0 800 500" ...>
  // Indica las dimensiones naturales del contenido animado
  if (!width || !height) {
    const vb = html.match(/<svg[^>]+viewBox=["']\s*0\s+0\s+(\d+)\s+(\d+)\s*["']/i);
    if (vb) {
      width  = parseInt(vb[1]);
      height = parseInt(vb[2]);
    }
  }

  // ── Fallback si no se detectó nada ──────────────────────────────────────
  if (!width)  width  = 1080;
  if (!height) height = 1080;

  // ── 2. Duración: estrategias en orden de confianza ───────────────────────

  // A) data-duration en el <html> o <body> tag:  <html data-duration="15">
  const dataDur = html.match(/<(?:html|body)[^>]+data-duration=["']?(\d+(?:\.\d+)?)["']?/i);
  if (dataDur) {
    return { width, height, duration: parseFloat(dataDur[1]), durationSource: 'data-duration attribute' };
  }

  // B) Variable JS explícita: const DURATION = 12;  /  let duration = 12;
  //    o  const totalDuration = 12000; (en ms)
  const durationVarMs = html.match(/(?:const|let|var)\s+(?:DURATION|duration|totalDuration|animDuration|videoDuration)\s*=\s*(\d+(?:\.\d+)?)\s*;/);
  if (durationVarMs) {
    const val = parseFloat(durationVarMs[1]);
    // Si el valor es > 300 asumimos ms, si no segundos
    const secs = val > 300 ? val / 1000 : val;
    return { width, height, duration: Math.round(secs), durationSource: 'JS duration variable' };
  }

  // C) setTimeout máximo → indica cuándo termina la última escena
  //    setTimeout(() => ..., 12000)  /  setTimeout(fn, 12_000)
  const setTimeouts: number[] = [];
  const stRe = /setTimeout\s*\([^,]+,\s*([\d_]+(?:\.\d+)?)\s*\)/g;
  let stm: RegExpExecArray | null;
  while ((stm = stRe.exec(html)) !== null) {
    const ms = parseFloat(stm[1].replace(/_/g, ''));
    if (ms > 100) setTimeouts.push(ms); // ignora < 100ms (debounces etc.)
  }
  if (setTimeouts.length > 0) {
    const maxMs = Math.max(...setTimeouts);
    // Agrega 1.5s de margen después del último timeout
    const secs = Math.ceil(maxMs / 1000) + 1.5;
    return { width, height, duration: secs, durationSource: `setTimeout max ${maxMs}ms` };
  }

  // D) Solo animaciones de ENTRADA: deben contener 'both' o 'forwards'
  //    Eso excluye las infinitas y las de loop. Solo cuentan las que terminan.
  //
  //    Patrones que buscamos:
  //    JSX string literal:  animation:'fadeUp .6s .55s both'
  //    JSX string literal:  animation:"fadeUp .6s .55s forwards"
  //    CSS property:        animation: fadeUp .6s .55s ease-in-out both;
  const animEnds: number[] = [];

  // Solo captura el contenido de strings quoted (no template literals ni texto libre)
  // que incluyan 'both' o 'forwards' — eso garantiza que son animaciones de entrada
  const animQuotedRe = /animation\s*[:=]\s*['"]([^'"]*(?:both|forwards)[^'"]*)['"]|animation\s*:\s*([^;{}]+(?:both|forwards)[^;{}]*)/g;
  let am: RegExpExecArray | null;
  while ((am = animQuotedRe.exec(html)) !== null) {
    const decl = (am[1] ?? am[2] ?? '').trim();
    if (!decl || decl.includes('infinite')) continue;

    // Extrae pares de tiempos: "0.6s", ".55s", "1s", etc.
    const times = [...decl.matchAll(/(\d*\.?\d+)s/g)].map(m => parseFloat(m[1]));

    // Busca el par (duración, delay) — ignoramos valores > 30s (casi siempre ruido)
    const reasonableTimes = times.filter(t => t <= 30);
    if (reasonableTimes.length === 0) continue;

    const dur   = reasonableTimes[0] ?? 0;
    const delay = reasonableTimes[1] ?? 0;
    const end   = dur + delay;
    if (end > 0 && end <= 30) animEnds.push(end);
  }
  // ── Mínimo por formato ────────────────────────────────────────────────────
  // Para ads de loop estático (sin setTimeout) la duración mínima depende
  // del formato: hay que grabar suficiente para que se vea bien en la red social.
  const ratio = width / height;
  let formatMin = 10;
  let formatLabel = 'genérico';
  if (ratio < 0.7)                   { formatMin = 10; formatLabel = 'story 9:16'; }
  else if (ratio > 1.5)              { formatMin = 10; formatLabel = 'banner 16:9'; }
  else if (Math.abs(ratio - 1) < 0.1) { formatMin = 8;  formatLabel = 'feed 1:1';   }

  if (animEnds.length > 0) {
    const maxEnd = Math.max(...animEnds);
    // Deja que la entrada se complete + 3s de estado visible, pero nunca menos que el mínimo de formato
    const fromAnim = Math.ceil(maxEnd) + 3;
    const secs = Math.max(fromAnim, formatMin);
    return { width, height, duration: secs, durationSource: `entrada ${maxEnd.toFixed(2)}s → ${secs}s (${formatLabel})` };
  }

  // E) Sin animaciones detectables → fallback puro por formato
  return { width, height, duration: formatMin, durationSource: `fallback ${formatLabel}` };
}
