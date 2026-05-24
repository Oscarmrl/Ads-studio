import { NextRequest, NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/store';

export async function GET() {
  return NextResponse.json(listProjects());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const project = createProject({
    name:     body.name     || 'Nuevo proyecto',
    html:     body.html     || '',
    duration: body.duration || 15,
    width:    body.width    || 1080,
    height:   body.height   || 1080,
    voice:    body.voice    || [],
    sfx:      body.sfx      || [],
  });
  return NextResponse.json(project, { status: 201 });
}
