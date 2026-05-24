// POST /api/upload-html — sube un archivo HTML a public/ads/
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!file.name.endsWith('.html')) {
    return NextResponse.json({ error: 'Solo archivos .html' }, { status: 400 });
  }

  const adsDir = path.join(process.cwd(), 'public', 'ads');
  fs.mkdirSync(adsDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const dest = path.join(adsDir, file.name);
  fs.writeFileSync(dest, buffer);

  return NextResponse.json({ filename: file.name });
}

export async function GET() {
  const adsDir = path.join(process.cwd(), 'public', 'ads');
  fs.mkdirSync(adsDir, { recursive: true });
  const files = fs.readdirSync(adsDir).filter(f => f.endsWith('.html'));
  return NextResponse.json(files);
}
