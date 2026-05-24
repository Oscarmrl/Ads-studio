// GET /api/parse-html?file=feed-1-automatiza.html
// Devuelve { width, height, duration, durationSource }
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { parseHtmlMeta } from '@/lib/parse-html-meta';

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file');
  if (!file) return NextResponse.json({ error: 'Falta ?file=' }, { status: 400 });

  const safeName = path.basename(file);
  const filePath = path.join(process.cwd(), 'public', 'ads', safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: `Archivo no encontrado: ${safeName}` }, { status: 404 });
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const meta = parseHtmlMeta(html);
  return NextResponse.json(meta);
}
