// lib/store.ts — persistencia local en JSON files (sin base de datos)
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = path.join(process.cwd(), 'data', 'projects');

export interface AudioCue {
  at: number;
  src: string;
  vol?: number;
}

export interface Project {
  id: string;
  name: string;
  html: string;         // nombre del archivo en public/ads/
  duration: number;
  width: number;
  height: number;
  voice: AudioCue[];
  sfx: AudioCue[];
  mobileOutput?: string;  // MP4 1080×1920 (Story / mobile)
  desktopOutput?: string; // MP4 1080×1080 (Feed / desktop)
  lastOutput?: string;    // alias de mobileOutput (compatibilidad)
  createdAt: string;
  updatedAt: string;
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function projectPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

export function listProjects(): Project[] {
  ensureDir();
  return fs
    .readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')) as Project)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getProject(id: string): Project | null {
  const p = projectPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
  ensureDir();
  const now = new Date().toISOString();
  const project: Project = { ...data, id: uuidv4(), createdAt: now, updatedAt: now };
  fs.writeFileSync(projectPath(project.id), JSON.stringify(project, null, 2));
  return project;
}

export function updateProject(id: string, data: Partial<Project>): Project | null {
  const existing = getProject(id);
  if (!existing) return null;
  const updated: Project = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
  fs.writeFileSync(projectPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export function deleteProject(id: string): boolean {
  const p = projectPath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

// Importa un config JSON existente (del pipeline anterior) como proyecto nuevo
export function importLegacyConfig(configPath: string, name?: string): Project {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const baseName = path.basename(configPath, '.json');
  return createProject({
    name: name || baseName,
    html: path.basename(raw.html),
    duration: raw.duration,
    width: raw.width || 1280,
    height: raw.height || 800,
    voice: raw.voice || [],
    sfx: raw.sfx || [],
  });
}
