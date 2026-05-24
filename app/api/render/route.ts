// POST /api/render — inicia un render job
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getProject, updateProject } from '@/lib/store';
import { createJob, updateJob, pushLog } from '@/lib/render-manager';
import { runPipeline } from '@/engine/pipeline';

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();
  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!project.html) return NextResponse.json({ error: 'El proyecto no tiene HTML asignado' }, { status: 400 });

  const jobId = uuidv4();
  createJob(jobId, projectId);

  // Lanzar pipeline async (sin await) para responder inmediatamente
  (async () => {
    try {
      updateJob(jobId, { status: 'recording', progress: 5 });
      const baseDir = process.cwd();

      const { mobileFile, desktopFile } = await runPipeline({
        config: {
          html:     project.html,
          duration: project.duration,
          width:    project.width,
          height:   project.height,
          voice:    project.voice,
          sfx:      project.sfx,
        },
        baseDir,
        onProgress: (step, detail) => {
          let progress = 10;
          if (step === 'record')                        progress = 20;
          if (detail.includes('Grabando'))              progress = 45;
          if (step === 'mix' && detail.includes('2/3')) progress = 60;
          if (step === 'mix' && detail.includes('3/3')) progress = 80;
          if (step === 'done')                          progress = 100;

          pushLog(jobId, `[${step}] ${detail}`, progress);

          if (step === 'record' && detail.includes('Grabando')) {
            updateJob(jobId, { status: 'recording' });
          }
          if (step === 'mix') {
            updateJob(jobId, { status: 'mixing' });
          }
        },
      });

      updateProject(projectId, {
        mobileOutput:  mobileFile,
        desktopOutput: desktopFile,
        lastOutput:    mobileFile,   // compatibilidad con proyectos anteriores
      });
      updateJob(jobId, {
        status:      'done',
        progress:    100,
        outputFile:  mobileFile,
        desktopFile: desktopFile,
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog(jobId, `[error] ${msg}`);
      updateJob(jobId, { status: 'error', error: msg });
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}
