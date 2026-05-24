// GET /api/render/[id] — SSE stream del progreso de un job
import { NextRequest } from 'next/server';
import { subscribe, getJob } from '@/lib/render-manager';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const job = getJob(id);
  if (!job) {
    return new Response('Job no encontrado', { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribe(id, (data) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        // Si terminó, cerrar el stream
        const parsed = JSON.parse(data);
        if (parsed.status === 'done' || parsed.status === 'error') {
          setTimeout(() => {
            try { controller.close(); } catch {}
          }, 500);
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
