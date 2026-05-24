// GET /api/outputs/[file] — sirve un MP4 generado para preview/descarga
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

type Ctx = { params: Promise<{ file: string }> };

export async function GET(_: NextRequest, { params }: Ctx) {
  const { file } = await params;
  const safeName = path.basename(file); // evita path traversal
  const filePath = path.join(process.cwd(), 'data', 'outputs', safeName);

  if (!fs.existsSync(filePath) || !safeName.endsWith('.mp4')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
      'Content-Disposition': `inline; filename="${safeName}"`,
    },
  });
}
