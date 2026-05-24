// POST /api/ai/voice-options
// Genera el mismo script con hasta 4 voces distintas de ElevenLabs para que el usuario elija
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { listVoices, textToSpeech } from '@/lib/elevenlabs';

export interface VoiceOption {
  voiceId: string;
  name: string;
  previewUrl: string;
  filename: string;
}

// Modelos en orden de preferencia (de más moderno a más compatible)
const MODEL_FALLBACKS = [
  'eleven_multilingual_v2',   // Creator plan+
  'eleven_turbo_v2_5',        // Free tier, multilingual
  'eleven_turbo_v2',          // Free tier, multilingual
  'eleven_multilingual_v1',   // Free tier, older
  'eleven_monolingual_v1',    // Free tier, English only (último recurso)
];

async function textToSpeechWithFallback(
  text: string,
  voiceId: string,
): Promise<Buffer> {
  let lastError: Error | null = null;
  for (const modelId of MODEL_FALLBACKS) {
    try {
      const buf = await textToSpeech({ text, voiceId, modelId });
      console.log(`[voice-options] TTS OK con modelo: ${modelId}`);
      return buf;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      // Si el error no es de modelo (e.g. voz inválida, cuota), no seguir probando
      if (!msg.includes('model') && !msg.includes('422') && !msg.includes('400')) {
        throw lastError;
      }
      console.warn(`[voice-options] Modelo ${modelId} falló (${msg.slice(0, 80)}), probando siguiente…`);
    }
  }
  throw lastError ?? new Error('Todos los modelos de ElevenLabs fallaron');
}

export async function POST(req: NextRequest) {
  try {
    const { script, projectId } = await req.json();
    if (!script?.trim()) return NextResponse.json({ error: 'Falta el script' }, { status: 400 });
    if (!projectId)       return NextResponse.json({ error: 'Falta projectId' }, { status: 400 });

    // Crear carpeta de previews para este proyecto
    const previewDir = path.join(process.cwd(), 'public', 'previews', projectId);
    fs.mkdirSync(previewDir, { recursive: true });

    // Obtener voces disponibles
    let allVoices;
    try {
      allVoices = await listVoices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[voice-options] Error al obtener voces:', msg);
      return NextResponse.json(
        { error: `Error conectando con ElevenLabs: ${msg}` },
        { status: 502 }
      );
    }

    if (allVoices.length === 0) {
      return NextResponse.json(
        { error: 'No hay voces en tu cuenta de ElevenLabs. Verifica tu API key.' },
        { status: 400 }
      );
    }

    // Seleccionar hasta 4 voces diversas por categoría
    const premade   = allVoices.filter(v => v.category === 'premade' || !v.category);
    const cloned    = allVoices.filter(v => v.category === 'cloned');
    const generated = allVoices.filter(v => v.category === 'generated');

    const pool = [
      ...premade.slice(0, 2),
      ...cloned.slice(0, 1),
      ...generated.slice(0, 1),
    ];
    const selected = pool.length >= 2 ? pool.slice(0, 4) : allVoices.slice(0, 4);

    console.log(`[voice-options] Generando ${selected.length} voces para proyecto ${projectId}`);

    // Generar voces SECUENCIALMENTE para evitar rate-limits
    const options: VoiceOption[] = [];
    for (const voice of selected) {
      const filename = `${voice.voice_id}.mp3`;
      const filePath = path.join(previewDir, filename);

      try {
        if (!fs.existsSync(filePath)) {
          console.log(`[voice-options] Generando voz: ${voice.name} (${voice.voice_id})`);
          const buffer = await textToSpeechWithFallback(script, voice.voice_id);
          fs.writeFileSync(filePath, buffer);
        } else {
          console.log(`[voice-options] Reutilizando preview existente: ${filename}`);
        }

        options.push({
          voiceId:    voice.voice_id,
          name:       voice.name,
          previewUrl: `/previews/${projectId}/${filename}`,
          filename,
        });
      } catch (err) {
        // Una voz falla → la saltamos (no abortamos todo)
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[voice-options] Falló la voz ${voice.name}: ${msg}`);
      }
    }

    if (options.length === 0) {
      return NextResponse.json(
        { error: 'ElevenLabs no pudo generar ninguna voz. Verifica tu plan y saldo de caracteres.' },
        { status: 502 }
      );
    }

    console.log(`[voice-options] Devolviendo ${options.length} opciones de voz`);
    return NextResponse.json(options);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[voice-options] Error inesperado:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
