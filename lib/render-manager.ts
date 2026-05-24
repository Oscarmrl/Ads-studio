// lib/render-manager.ts — registro global de renders en curso (SSE)
// Solo vive en memoria del proceso de Next.js (suficiente para uso local)

export type RenderStatus = 'pending' | 'recording' | 'mixing' | 'done' | 'error';

export interface RenderJob {
  id: string;
  projectId: string;
  status: RenderStatus;
  logs: string[];
  progress: number;    // 0-100
  outputFile?: string; // MP4 mobile  (1080×1920)
  desktopFile?: string;// MP4 desktop (1080×1080)
  error?: string;
  startedAt: number;
}

// Map global — persiste mientras corra `next dev`
const jobs = new Map<string, RenderJob>();

// Listeners SSE por jobId
const listeners = new Map<string, Set<(data: string) => void>>();

export function createJob(id: string, projectId: string): RenderJob {
  const job: RenderJob = {
    id, projectId, status: 'pending', logs: [], progress: 0, startedAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): RenderJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<RenderJob>) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
  emit(id, job);
}

export function pushLog(id: string, line: string, progress?: number) {
  const job = jobs.get(id);
  if (!job) return;
  job.logs.push(line);
  if (progress !== undefined) job.progress = progress;
  emit(id, job);
}

function emit(id: string, job: RenderJob) {
  const set = listeners.get(id);
  if (!set) return;
  const payload = JSON.stringify(job);
  set.forEach(fn => fn(payload));
}

export function subscribe(id: string, fn: (data: string) => void): () => void {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)!.add(fn);
  // Emit current state immediately
  const job = jobs.get(id);
  if (job) fn(JSON.stringify(job));
  return () => {
    listeners.get(id)?.delete(fn);
  };
}
