'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  LayoutGrid, Film, Clapperboard, Mic, Volume2,
  RefreshCw, Trash2, ChevronRight, Play, Plus,
  Video, Music2, XCircle, Download,
} from 'lucide-react';

interface AudioCue { at: number; src: string; vol?: number; }
interface Project {
  id: string; name: string; html: string;
  duration: number; width: number; height: number;
  voice: AudioCue[]; sfx: AudioCue[];
  lastOutput?: string; updatedAt: string;
}
interface RenderState {
  jobId: string;
  status: 'pending' | 'recording' | 'mixing' | 'done' | 'error';
  progress: number; outputFile?: string; error?: string;
}

/* ── Shared styles ─────────────────────────────────────────── */
const S = {
  sidebar: {
    width: 220, minHeight: '100vh', background: '#fff',
    borderRight: '1px solid #E4E4E9', display: 'flex',
    flexDirection: 'column' as const, flexShrink: 0,
    position: 'sticky' as const, top: 0, alignSelf: 'flex-start',
  },
  card: {
    background: '#fff', borderRadius: 14,
    boxShadow: '0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
    overflow: 'hidden' as const,
  },
  darkCard: {
    background: '#1A1A1A', borderRadius: 14,
    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
    overflow: 'hidden' as const,
  },
  btnPrimary: {
    background: '#111', color: '#fff', border: 'none',
    borderRadius: 8, padding: '9px 20px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: -0.2,
  } as React.CSSProperties,
  btnSecondary: {
    background: '#fff', color: '#111',
    border: '1.5px solid #E4E4E9', borderRadius: 8,
    padding: '9px 20px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  input: {
    background: '#F5F5F8', border: '1.5px solid #E4E4E9',
    borderRadius: 8, padding: '9px 14px', color: '#111',
    fontSize: 13, outline: 'none', width: '100%',
    fontFamily: 'inherit',
  } as React.CSSProperties,
};

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [renders,  setRenders]  = useState<Record<string, RenderState>>({});
  const [newName,  setNewName]  = useState('');
  const [creating, setCreating] = useState(false);
  const [navHover, setNavHover] = useState('');

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/projects');
    setProjects(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const startRender = async (projectId: string) => {
    const res = await fetch('/api/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) { alert((await res.json()).error); return; }
    const { jobId } = await res.json();
    setRenders(prev => ({ ...prev, [projectId]: { jobId, status: 'pending', progress: 0 } }));
    const es = new EventSource(`/api/render/${jobId}`);
    es.onmessage = (e) => {
      const job = JSON.parse(e.data);
      setRenders(prev => ({ ...prev, [projectId]: { jobId, status: job.status, progress: job.progress, outputFile: job.outputFile, error: job.error } }));
      if (job.status === 'done' || job.status === 'error') { es.close(); if (job.status === 'done') fetchProjects(); }
    };
    es.onerror = () => es.close();
  };

  const createProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName(''); setCreating(false); fetchProjects();
  };

  const deleteProject = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto?')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    fetchProjects();
  };

  const navItems: { label: string; icon: React.ReactNode; href: string; active: boolean }[] = [
    { label: 'Proyectos', icon: <LayoutGrid size={15} />, href: '/', active: true },
    { label: 'Outputs',   icon: <Film size={15} />,       href: '/api/outputs', active: false },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#EBEBEF' }}>

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside style={S.sidebar}>
        {/* Logo */}
        <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid #E4E4E9' }}>
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: -1, color: '#111' }}>
            Ad<span style={{ fontWeight: 400 }}>Studio</span><span style={{ color: '#111', fontWeight: 900 }}>.</span>
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Generador de anuncios</div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '16px 12px', flex: 1 }}>
          {navItems.map(item => (
            <Link key={item.label} href={item.href}
              onMouseEnter={() => setNavHover(item.label)}
              onMouseLeave={() => setNavHover('')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                textDecoration: 'none', fontSize: 13, fontWeight: item.active ? 700 : 500,
                color: item.active ? '#111' : '#666',
                background: item.active ? '#F0F0F3' : navHover === item.label ? '#F5F5F8' : 'transparent',
                transition: 'background 0.12s',
              }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Stats at bottom */}
        <div style={{ padding: '16px 20px 24px', borderTop: '1px solid #E4E4E9' }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Proyectos totales</div>
          <div style={{ fontWeight: 900, fontSize: 28, letterSpacing: -1, color: '#111' }}>
            {projects.length}
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: '36px 40px', minWidth: 0 }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontWeight: 900, fontSize: 34, letterSpacing: -1.5, color: '#111', lineHeight: 1 }}>
              Proyectos
            </h1>
            <p style={{ fontSize: 13, color: '#999', marginTop: 6 }}>
              {projects.length > 0 ? `${projects.length} proyecto${projects.length !== 1 ? 's' : ''} · elige uno para editar o renderizar` : 'Crea tu primer proyecto'}
            </p>
          </div>
          {/* New project input + button */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createProject()}
              placeholder="Nombre del proyecto…"
              style={{ ...S.input, width: 220 }}
            />
            <button onClick={createProject} disabled={creating || !newName.trim()}
              style={{
                ...S.btnPrimary, opacity: creating || !newName.trim() ? 0.4 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Plus size={14} /> Nuevo
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ color: '#999', fontSize: 14, paddingTop: 40 }}>Cargando proyectos…</div>
        ) : projects.length === 0 ? (
          <div style={{ ...S.card, padding: 60, textAlign: 'center' as const }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: '#ccc' }}>
              <Clapperboard size={52} strokeWidth={1.5} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6, letterSpacing: -0.5 }}>Sin proyectos aún</div>
            <div style={{ color: '#999', fontSize: 14 }}>Escribe un nombre arriba y presiona Enter</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {projects.map((p, idx) => {
              const render = renders[p.id];
              const inProgress = render && render.status !== 'done' && render.status !== 'error';
              const hasOutput  = render?.outputFile || p.lastOutput;
              // Cada 5to proyecto usa dark card (como el de referencia)
              const isDark     = idx % 5 === 4 || render?.status === 'done';

              return isDark && !inProgress && render?.status !== 'error' ? (
                /* ── Dark Card ─────────────────────────────── */
                <div key={p.id} style={{ ...S.darkCard, padding: 22, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.4, flex: 1, marginRight: 8 }}>{p.name}</div>
                    <ChevronRight size={16} color="#555" />
                  </div>
                  <div style={{ width: '100%', height: 2, background: '#333', margin: '8px 0 14px', borderRadius: 1 }} />
                  <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                    <span>{p.width}×{p.height}</span><span>·</span>
                    <span>{p.duration}s</span><span>·</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Mic size={11} />{p.voice.length}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Volume2 size={11} />{p.sfx.length}</span>
                  </div>
                  {hasOutput && (
                    <a href={`/api/outputs/${render?.outputFile || p.lastOutput}`} target="_blank" rel="noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '9px 14px', marginBottom: 12,
                        background: 'rgba(255,255,255,0.08)', borderRadius: 8,
                        fontSize: 12, color: '#aaa', textDecoration: 'none', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                      <Play size={11} style={{ flexShrink: 0 }} />
                      {render?.outputFile || p.lastOutput}
                    </a>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <Link href={`/project/${p.id}`}
                      style={{ flex: 1, textAlign: 'center', padding: '9px 0', background: 'rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#ccc', textDecoration: 'none' }}>
                      Editar
                    </Link>
                    <button onClick={() => startRender(p.id)}
                      style={{
                        flex: 1, padding: '9px 0', background: '#fff', border: 'none', borderRadius: 8,
                        fontSize: 13, fontWeight: 700, color: '#111', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      <RefreshCw size={13} /> Re-render
                    </button>
                    <button onClick={() => deleteProject(p.id)} title="Eliminar"
                      style={{
                        padding: '9px 12px', background: 'transparent', border: '1px solid #333',
                        borderRadius: 8, fontSize: 13, color: '#555', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                      }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Light Card ────────────────────────────── */
                <div key={p.id} style={{ ...S.card, padding: 22, display: 'flex', flexDirection: 'column' }}>
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#111', letterSpacing: -0.4, flex: 1, marginRight: 8, lineHeight: 1.3 }}>{p.name}</div>
                    <Link href={`/project/${p.id}`} style={{ color: '#bbb', textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <ChevronRight size={16} />
                    </Link>
                  </div>
                  {/* Underline accent */}
                  <span className="card-underline" />

                  {/* Meta */}
                  <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                    <span>{p.width}×{p.height}</span><span>·</span>
                    <span>{p.duration}s</span><span>·</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Mic size={11} /> {p.voice.length}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Volume2 size={11} /> {p.sfx.length}</span>
                  </div>

                  {/* HTML badge */}
                  <div style={{ marginBottom: 14 }}>
                    <span style={{
                      display: 'inline-block', fontSize: 11, fontWeight: 600,
                      background: p.html ? '#F0F5F0' : '#F5F5F8',
                      color: p.html ? '#16A34A' : '#aaa',
                      border: `1.5px solid ${p.html ? '#BBE0BB' : '#E4E4E9'}`,
                      borderRadius: 6, padding: '3px 9px',
                      maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                    }}>
                      {p.html || 'Sin HTML asignado'}
                    </span>
                  </div>

                  {/* Progress */}
                  {inProgress && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {render.status === 'recording'
                            ? <><Video size={12} /> Grabando</>
                            : <><Music2 size={12} /> Mezclando</>
                          }
                        </span>
                        <span style={{ color: '#999' }}>{render.progress}%</span>
                      </div>
                      <div style={{ background: '#F0F0F3', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                        <div className="progress-bar" style={{ width: `${render.progress}%`, height: '100%', borderRadius: 99, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {render?.status === 'error' && (
                    <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <XCircle size={13} style={{ flexShrink: 0 }} /> {render.error}
                    </div>
                  )}

                  {/* Output */}
                  {hasOutput && !inProgress && render?.status !== 'error' && (
                    <a href={`/api/outputs/${render?.outputFile || p.lastOutput}`} target="_blank" rel="noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '8px 12px', marginBottom: 12,
                        background: '#F0F7F0', border: '1.5px solid #BBE0BB',
                        borderRadius: 8, fontSize: 12, color: '#16A34A',
                        textDecoration: 'none', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                      <Download size={12} style={{ flexShrink: 0 }} />
                      {render?.outputFile || p.lastOutput}
                    </a>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <Link href={`/project/${p.id}`} style={{ ...S.btnSecondary, flex: 1, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                      Editar
                    </Link>
                    <button onClick={() => startRender(p.id)} disabled={!!inProgress}
                      style={{
                        ...S.btnPrimary, flex: 1,
                        opacity: inProgress ? 0.5 : 1,
                        cursor: inProgress ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      {inProgress
                        ? `${render.progress}%…`
                        : <><Play size={13} /> Render</>
                      }
                    </button>
                    <button onClick={() => deleteProject(p.id)} title="Eliminar"
                      style={{
                        padding: '9px 12px', background: '#fff', border: '1.5px solid #E4E4E9',
                        borderRadius: 8, color: '#bbb', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                      }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
