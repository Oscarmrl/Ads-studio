// GET  /api/voice — lista voces ElevenLabs
// POST /api/voice — genera TTS y guarda en uploads/voice/
import { NextRequest, NextResponse } from 'next/server';
import { listVoices, textToSpeech } from '@/lib/elevenlabs';
import path from 'path';
import fs from 'fs';

export async function GET() {
  try {
    const voices = await listVoices();
    return NextResponse.json(voices);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, filename } = await req.json();
    if (!text || !voiceId || !filename) {
      return NextResponse.json({ error: 'text, voiceId y filename son requeridos' }, { status: 400 });
    }

    const buffer = await textToSpeech({ text, voiceId });
    const voiceDir = path.join(process.cwd(), 'uploads', 'voice');
    fs.mkdirSync(voiceDir, { recursive: true });

    const safeName = filename.endsWith('.mp3') ? filename : `${filename}.mp3`;
    const dest = path.join(voiceDir, safeName);
    fs.writeFileSync(dest, buffer);

    return NextResponse.json({ filename: safeName, size: buffer.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
