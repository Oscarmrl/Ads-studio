// GET /api/test-elevenlabs — diagnóstico rápido de la API key
import { NextResponse } from 'next/server';

export async function GET() {
  const key = process.env.ELEVENLABS_API_KEY ?? '';

  // Muestra primeros y últimos 6 chars para identificar sin exponer la key completa
  const masked = key.length > 12
    ? `${key.slice(0, 6)}…${key.slice(-6)} (${key.length} chars)`
    : key.length === 0 ? '(vacía)' : '(demasiado corta)';

  let status = 'desconocido';
  let voiceCount = 0;
  let errorDetail = '';

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
    });
    if (res.ok) {
      const data = await res.json();
      voiceCount = data.voices?.length ?? 0;
      status = 'OK';
    } else {
      const body = await res.text().catch(() => '');
      status = `Error HTTP ${res.status}`;
      errorDetail = body.slice(0, 300);
    }
  } catch (err) {
    status = 'Error de red';
    errorDetail = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ masked, status, voiceCount, errorDetail });
}
