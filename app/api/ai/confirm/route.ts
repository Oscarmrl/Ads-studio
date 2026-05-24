// POST /api/ai/confirm
// Mueve la voz elegida de previews/ a uploads/voice/ y actualiza el proyecto con voz + SFX
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { updateProject } from '@/lib/store';
import type { SfxSuggestion } from '@/lib/claude';

export async function POST(req: NextRequest) {
  try {
    const {
      projectId,
      voiceId,
      voiceName,
      sfxSuggestions,
    }: {
      projectId: string;
      voiceId: string;
      voiceName: string;
      sfxSuggestions: SfxSuggestion[];
    } = await req.json();

    // Ruta del preview generado
    const previewPath = path.join(
      process.cwd(), 'public', 'previews', projectId, `${voiceId}.mp3`
    );
    if (!fs.existsSync(previewPath)) {
      return NextResponse.json({ error: 'Preview no encontrado, regenera las opciones' }, { status: 404 });
    }

    // Destino en uploads/voice/
    const voiceDir = path.join(process.cwd(), 'uploads', 'voice');
    fs.mkdirSync(voiceDir, { recursive: true });
    const destFilename = `ai_voice_${projectId.slice(0, 8)}.mp3`;
    const destPath     = path.join(voiceDir, destFilename);
    fs.copyFileSync(previewPath, destPath);

    // Actualizar proyecto: una pista de voz al inicio + SFX sugeridos
    const updated = updateProject(projectId, {
      voice: [{ at: 0.3, src: `voice/${destFilename}`, vol: 0.92 }],
      sfx:   sfxSuggestions.map(s => ({ at: s.at, src: s.src, vol: s.vol })),
    });

    if (!updated) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    // Limpiar previews de este proyecto
    const previewDir = path.join(process.cwd(), 'public', 'previews', projectId);
    try { fs.rmSync(previewDir, { recursive: true, force: true }); } catch {}

    return NextResponse.json({ ok: true, voiceFile: destFilename, project: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
