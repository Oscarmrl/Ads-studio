// lib/elevenlabs.ts — cliente ElevenLabs REST API
const BASE = 'https://api.elevenlabs.io/v1';

function getKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Falta ELEVENLABS_API_KEY en .env.local');
  return key;
}

export interface ELVoice {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string;
}

export async function listVoices(): Promise<ELVoice[]> {
  const res = await fetch(`${BASE}/voices`, {
    headers: { 'xi-api-key': getKey() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('API key de ElevenLabs inválida (401). Verifica ELEVENLABS_API_KEY en .env.local');
    throw new Error(`ElevenLabs /voices error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.voices as ELVoice[];
}

export interface TTSOptions {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

export async function textToSpeech({
  text,
  voiceId,
  modelId = 'eleven_multilingual_v2',
  stability = 0.5,
  similarityBoost = 0.75,
}: TTSOptions): Promise<Buffer> {
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': getKey(),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('API key de ElevenLabs inválida (401)');
    if (res.status === 422) throw new Error(`Modelo no soportado en tu plan (422): ${body.slice(0, 150)}`);
    if (res.status === 429) throw new Error('Límite de peticiones alcanzado (429). Espera un momento.');
    throw new Error(`ElevenLabs TTS error ${res.status}: ${body.slice(0, 200)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
