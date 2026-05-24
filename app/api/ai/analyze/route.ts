// POST /api/ai/analyze
// Analiza el HTML con Claude y devuelve script + sugerencias de SFX
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { analyzeAdHtml } from '@/lib/claude';
import { getProject } from '@/lib/store';

export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();

    const project = getProject(projectId);
    if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    if (!project.html) return NextResponse.json({ error: 'El proyecto no tiene HTML asignado' }, { status: 400 });

    // Leer el HTML
    const htmlPath = path.join(process.cwd(), 'public', 'ads', project.html);
    if (!fs.existsSync(htmlPath)) {
      return NextResponse.json({ error: `HTML no encontrado: ${project.html}` }, { status: 404 });
    }
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Listar SFX disponibles
    const soundsDir = path.join(process.cwd(), 'uploads', 'sounds');
    const availableSounds = fs.existsSync(soundsDir)
      ? fs.readdirSync(soundsDir).filter(f => /\.(mp3|wav|ogg)$/i.test(f))
      : [];

    // Analizar con Claude
    const analysis = await analyzeAdHtml(htmlContent, project.duration, availableSounds);

    return NextResponse.json(analysis);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
