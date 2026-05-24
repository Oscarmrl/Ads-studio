'use client';
import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, Check, Play, Pause, Sparkles, Upload,
  RotateCcw, Download, Mic, Waves, Tag, FileText,
  CheckCircle2, XCircle, Clapperboard,
} from 'lucide-react';

/* ── Shared design tokens ───────────────────────────────────────── */
const T = {
  card: {
    background: '#fff', borderRadius: 14,
    boxShadow: '0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
  } as React.CSSProperties,
  input: {
    background: '#F5F5F8', border: '1.5px solid #E4E4E9', borderRadius: 8,
    padding: '8px 12px', color: '#111', fontSize: 13, outline: 'none',
    width: '100%', fontFamily: 'inherit',
  } as React.CSSProperties,
  label: {
    fontSize: 11, fontWeight: 700, color: '#666', letterSpacing: 0.4,
    textTransform: 'uppercase' as const, display: 'block', marginBottom: 6,
  },
  section: { padding: 22 } as React.CSSProperties,
  sectionTitle: { fontWeight: 800, fontSize: 15, color: '#111', letterSpacing: -0.3 },
  underline: {
    display: 'block', width: '100%', height: 2, background: '#111',
    margin: '8px 0 16px', borderRadius: 1,
  } as React.CSSProperties,
  btnPrimary: {
    background: '#111', color: '#fff', border: 'none', borderRadius: 8,
    padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    background: '#fff', color: '#111', border: '1.5px solid #E4E4E9', borderRadius: 8,
    padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  } as React.CSSProperties,
};

/* ── Types ──────────────────────────────────────────────────────── */
interface AudioCue  { at: number; src: string; vol: number; }
interface Project {
  id: string; name: string; html: string;
  duration: number; width: number; height: number;
  voice: AudioCue[]; sfx: AudioCue[];
  lastOutput?: string;
}
interface RenderState {
  jobId: string; status: string; progress: number;
  logs: string[]; outputFile?: string; error?: string;
}
interface VoiceOption   { voiceId: string; name: string; previewUrl: string; filename: string; }
interface SfxSuggestion { at: number; src: string; vol: number; }
type AiStep = 'idle' | 'analyzing' | 'generating' | 'choosing' | 'confirmed';

/* ── Spinner component ──────────────────────────────────────────── */
function Spinner({ color = '#111' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 18, height: 18,
      border: `2.5px solid ${color === '#111' ? '#E4E4E9' : 'rgba(255,255,255,0.2)'}`,
      borderTopColor: color, borderRadius: '50%',
      animation: 'spin 0.7s linear infinite', verticalAlign: 'middle',
    }} />
  );
}

/* ══════════════════════════════════════════════════════════════════
   Main page component
   ══════════════════════════════════════════════════════════════════ */
export default function ProjectEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  /* ── Core project state ─────────────────────────────────────── */
  const [project,   setProject]   = useState<Project | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [htmlFiles, setHtmlFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [metaHint,  setMetaHint]  = useState('');
  const [render,    setRender]    = useState<RenderState | null>(null);

  /* ── AI workflow state ──────────────────────────────────────── */
  const [aiStep,      setAiStep]      = useState<AiStep>('idle');
  const [aiError,     setAiError]     = useState('');
  const [aiScript,    setAiScript]    = useState('');
  const [aiTone,      setAiTone]      = useState('');
  const [aiProduct,   setAiProduct]   = useState('');
  const [sfxHints,    setSfxHints]    = useState<SfxSuggestion[]>([]);
  const [voiceOpts,   setVoiceOpts]   = useState<VoiceOption[]>([]);
  const [chosenVoice, setChosenVoice] = useState<VoiceOption | null>(null);
  const [playingId,   setPlayingId]   = useState<string | null>(null);
  const [audioRef,    setAudioRef]    = useState<HTMLAudioElement | null>(null);
  const [confirming,  setConfirming]  = useState(false);

  /* ── Data loading ───────────────────────────────────────────── */
  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) { router.push('/'); return; }
    setProject(await res.json());
  }, [id, router]);

  useEffect(() => { fetchProject(); }, [fetchProject]);
  useEffect(() => {
    fetch('/api/upload-html').then(r => r.json()).then(setHtmlFiles);
  }, []);

  /* ── HTML meta auto-detect + auto-save ─────────────────────── */
  const applyHtmlMeta = useCallback(async (filename: string) => {
    if (!filename || !project) return;
    const res = await fetch(`/api/parse-html?file=${encodeURIComponent(filename)}`);
    if (!res.ok) return;
    const meta = await res.json();
    const updated = { ...project, html: filename, width: meta.width, height: meta.height, duration: meta.duration };
    setProject(updated);
    setMetaHint(`✓ ${meta.width}×${meta.height} · ${meta.duration}s (${meta.durationSource})`);
    setTimeout(() => setMetaHint(''), 6000);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  }, [project]);

  /* ── AI: Step 1 — Claude analyzes HTML ─────────────────────── */
  const analyzeHtml = async () => {
    if (!project?.html) return;
    setAiStep('analyzing'); setAiError('');
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      const res  = await fetch('/api/ai/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiScript(data.script);
      setAiTone(data.tone);
      setAiProduct(data.productDescription);
      setSfxHints(data.sfxSuggestions || []);
      await generateVoiceOptions(data.script);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAiStep('idle');
    }
  };

  /* ── AI: Step 2 — ElevenLabs voice options ─────────────────── */
  const generateVoiceOptions = async (script: string) => {
    setAiStep('generating'); setAiError('');
    try {
      const res  = await fetch('/api/ai/voice-options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, projectId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVoiceOpts(data);
      setAiStep('choosing');
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAiStep('idle');
    }
  };

  /* ── AI: Step 3 — Confirm chosen voice ─────────────────────── */
  const confirmVoice = async (voice: VoiceOption) => {
    setAiError(''); setConfirming(true);
    try {
      const res  = await fetch('/api/ai/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, voiceId: voice.voiceId, voiceName: voice.name, sfxSuggestions: sfxHints }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProject(data.project);
      setChosenVoice(voice);
      setAiStep('confirmed');
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  };

  /* ── Audio preview playback ─────────────────────────────────── */
  const togglePlay = (opt: VoiceOption) => {
    if (playingId === opt.voiceId) {
      audioRef?.pause(); setPlayingId(null); return;
    }
    audioRef?.pause();
    const audio = new Audio(opt.previewUrl);
    audio.onended = () => setPlayingId(null);
    audio.play();
    setAudioRef(audio);
    setPlayingId(opt.voiceId);
  };

  /* ── Reset AI flow ──────────────────────────────────────────── */
  const resetAi = () => {
    audioRef?.pause();
    setAiStep('idle'); setAiError(''); setAiScript('');
    setAiTone(''); setAiProduct(''); setSfxHints([]);
    setVoiceOpts([]); setChosenVoice(null); setPlayingId(null);
  };

  /* ── Save / Upload / Render ─────────────────────────────────── */
  const save = async (patch?: Partial<Project>) => {
    if (!project) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch ?? project),
    });
    setProject(await res.json());
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const uploadHtml = async (file: File) => {
    setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload-html', { method: 'POST', body: fd });
    const { filename } = await res.json();
    setUploading(false);
    const files = await fetch('/api/upload-html').then(r => r.json());
    setHtmlFiles(files);
    await applyHtmlMeta(filename);
  };

  const startRender = async () => {
    if (!project) return;
    await save();
    const res = await fetch('/api/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id }),
    });
    if (!res.ok) { alert((await res.json()).error); return; }
    const { jobId } = await res.json();
    setRender({ jobId, status: 'pending', progress: 0, logs: [] });

    const es = new EventSource(`/api/render/${jobId}`);
    es.onmessage = (e) => {
      const job = JSON.parse(e.data);
      setRender({ jobId, status: job.status, progress: job.progress, logs: job.logs, outputFile: job.outputFile, error: job.error });
      if (job.status === 'done' || job.status === 'error') es.close();
    };
    es.onerror = () => es.close();
  };

  /* ── Loading guard ──────────────────────────────────────────── */
  if (!project) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EBEBEF', color: '#666', fontSize: 14 }}>
      Cargando…
    </div>
  );

  const inRender    = render && render.status !== 'done' && render.status !== 'error';
  const canRender   = !!project.html && !inRender;

  /* ════════════════════════════════════════════════════════════════
     JSX
     ════════════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#EBEBEF' }}>

        {/* ── Sidebar ───────────────────────────────────────────── */}
        <aside style={{
          width: 220, minHeight: '100vh', background: '#fff',
          borderRight: '1px solid #E4E4E9', display: 'flex', flexDirection: 'column',
          flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start',
        }}>
          <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid #E4E4E9' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: -1, color: '#111' }}>
                Ad<span style={{ fontWeight: 400 }}>Studio</span><span style={{ fontWeight: 900 }}>.</span>
              </div>
            </Link>
            <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>Editor de proyecto</div>
          </div>

          <nav style={{ padding: '16px 12px' }}>
            <Link href="/" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
              borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500, color: '#555',
            }}>
              <ChevronLeft size={15} /> Proyectos
            </Link>
          </nav>

          {/* AI progress indicator */}
          {aiStep !== 'idle' && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #E4E4E9' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#777', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>
                Flujo IA
              </div>
              {(['analyzing', 'generating', 'choosing', 'confirmed'] as AiStep[]).map((step, idx) => {
                const labels: Record<string, string> = { analyzing: 'Analizando', generating: 'Generando voces', choosing: 'Elige una voz', confirmed: 'Listo' };
                const stepIdx = ['analyzing', 'generating', 'choosing', 'confirmed'].indexOf(aiStep);
                const done    = idx < stepIdx || aiStep === 'confirmed';
                const active  = step === aiStep;
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      background: done ? '#111' : active ? '#444' : '#E4E4E9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: '#fff', fontWeight: 800,
                    }}>
                      {done ? <Check size={10} /> : idx + 1}
                    </div>
                    <span style={{ fontSize: 12, color: active ? '#111' : done ? '#444' : '#bbb', fontWeight: active ? 700 : 400 }}>
                      {labels[step]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Project quick-stats */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #E4E4E9', marginTop: 'auto' }}>
            <div style={{ fontSize: 11, color: '#777', marginBottom: 8, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Este proyecto
            </div>
            <div style={{ fontSize: 12, color: '#444', lineHeight: 2 }}>
              <div>{project.width} × {project.height} px</div>
              <div>{project.duration}s duración</div>
              <div>{project.voice.length} {project.voice.length === 1 ? 'voz' : 'voces'}</div>
              <div>{project.sfx.length} SFX</div>
            </div>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Top bar */}
          <div style={{
            background: '#fff', borderBottom: '1px solid #E4E4E9', padding: '0 32px',
            height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, zIndex: 40,
          }}>
            <input
              value={project.name}
              onChange={e => setProject({ ...project, name: e.target.value })}
              style={{
                fontWeight: 900, fontSize: 18, letterSpacing: -0.6, color: '#111',
                background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'inherit', width: 360,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => save()} disabled={saving} style={{
                ...T.btnSecondary,
                color: saved ? '#16A34A' : '#111',
                borderColor: saved ? '#BBE0BB' : '#E4E4E9',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {saved
                  ? <><Check size={13} color="#16A34A" /> Guardado</>
                  : saving ? 'Guardando…' : 'Guardar'
                }
              </button>
              <button
                onClick={startRender}
                disabled={!canRender || aiStep !== 'confirmed'}
                style={{
                  ...T.btnPrimary,
                  opacity: (!canRender || aiStep !== 'confirmed') ? 0.35 : 1,
                  transition: 'opacity 0.2s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                title={aiStep !== 'confirmed' ? 'Primero confirma una voz con IA' : ''}
              >
                {inRender
                  ? `Renderizando ${render.progress}%…`
                  : <><Play size={13} /> Renderizar</>
                }
              </button>
            </div>
          </div>

          {/* 2-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: '28px 32px', maxWidth: 1400 }}>

            {/* ══ LEFT COLUMN ══════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* HTML selector */}
              <div style={{ ...T.card, ...T.section }}>
                <span style={T.sectionTitle}>Archivo HTML</span>
                <span style={T.underline} />
                <select value={project.html} onChange={e => applyHtmlMeta(e.target.value)}
                  style={{ ...T.input, marginBottom: 10 }}>
                  <option value="">— Selecciona un HTML —</option>
                  {htmlFiles.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {metaHint && (
                  <div style={{ fontSize: 12, color: '#16A34A', background: '#F0FAF0', border: '1px solid #BBE0BB', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                    {metaHint}
                  </div>
                )}
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  textAlign: 'center', padding: '11px 0', cursor: 'pointer',
                  border: '2px dashed #D0D0D8', borderRadius: 8, color: '#777', fontSize: 13,
                  background: 'transparent', transition: 'border-color 0.15s',
                }}>
                  {uploading
                    ? 'Subiendo…'
                    : <><Upload size={14} /> Subir nuevo .html</>
                  }
                  <input type="file" accept=".html" style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && uploadHtml(e.target.files[0])} />
                </label>
              </div>

              {/* Live preview */}
              <div style={{ ...T.card, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #E4E4E9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={T.sectionTitle}>Preview en vivo</span>
                  {project.html && <span style={{ fontSize: 11, color: '#777' }}>{project.html}</span>}
                </div>
                {project.html ? (
                  <iframe key={project.html} src={`/ads/${project.html}`}
                    style={{ width: '100%', height: 340, border: 'none', display: 'block', background: '#F5F5F8' }}
                    sandbox="allow-scripts allow-same-origin" />
                ) : (
                  <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 14, flexDirection: 'column', gap: 10 }}>
                    <Clapperboard size={38} strokeWidth={1.4} />
                    <span style={{ color: '#aaa', fontSize: 13 }}>Selecciona un HTML para ver el preview</span>
                  </div>
                )}
              </div>

              {/* Config numbers */}
              <div style={{ ...T.card, ...T.section }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={T.sectionTitle}>Configuración</span>
                  <span style={{ fontSize: 11, color: '#999' }}>Auto-detectado del HTML</span>
                </div>
                <span style={T.underline} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {[
                    { lbl: 'Duración (s)', val: project.duration, step: 0.5, key: 'duration' },
                    { lbl: 'Ancho (px)',   val: project.width,    step: 1,   key: 'width'    },
                    { lbl: 'Alto (px)',    val: project.height,   step: 1,   key: 'height'   },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={T.label}>{f.lbl}</label>
                      <input type="number" value={f.val} step={f.step} min={1}
                        onChange={e => setProject({ ...project, [f.key]: +e.target.value })}
                        style={T.input} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline */}
              {project.duration > 0 && (project.voice.length > 0 || project.sfx.length > 0) && (
                <div style={{ ...T.card, ...T.section }}>
                  <span style={T.sectionTitle}>Timeline de audio</span>
                  <span style={T.underline} />
                  <Timeline project={project} />
                </div>
              )}
            </div>

            {/* ══ RIGHT COLUMN ═════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── AI Workflow panel ──────────────────────────── */}
              <AiPanel
                aiStep={aiStep}
                aiError={aiError}
                aiScript={aiScript}
                aiTone={aiTone}
                aiProduct={aiProduct}
                sfxHints={sfxHints}
                voiceOpts={voiceOpts}
                chosenVoice={chosenVoice}
                playingId={playingId}
                confirming={confirming}
                hasHtml={!!project.html}
                projectDuration={project.duration}
                onAnalyze={analyzeHtml}
                onTogglePlay={togglePlay}
                onConfirm={confirmVoice}
                onReset={resetAi}
                onRegenerate={() => generateVoiceOptions(aiScript)}
                onRender={startRender}
                inRender={!!inRender}
                renderProgress={render?.progress ?? 0}
              />

              {/* ── Render status panel ────────────────────────── */}
              {render && (
                <div style={{
                  background: render.status === 'done' ? '#fff' : render.status === 'error' ? '#fff' : '#1A1A1A',
                  borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
                }}>
                  <div style={{ padding: '18px 22px', borderBottom: `1px solid ${render.status === 'done' || render.status === 'error' ? '#E4E4E9' : '#2a2a2a'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: render.status === 'done' || render.status === 'error' ? '#111' : '#fff', letterSpacing: -0.3, display: 'flex', alignItems: 'center', gap: 7 }}>
                        {render.status === 'done'
                          ? <><CheckCircle2 size={16} color="#16A34A" /> Video generado</>
                          : render.status === 'error'
                          ? <><XCircle size={16} color="#DC2626" /> Error en render</>
                          : 'Renderizando…'
                        }
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: render.status === 'done' ? '#16A34A' : render.status === 'error' ? '#DC2626' : '#888' }}>
                        {render.status === 'done' ? 'Listo' : render.status === 'error' ? 'Error' : `${render.progress}%`}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: '16px 22px' }}>
                    {inRender && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ background: '#2a2a2a', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                          <div className="progress-bar" style={{ width: `${render.progress}%`, height: '100%', borderRadius: 99, transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )}
                    {render.status === 'error' && (
                      <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>
                        {render.error}
                      </div>
                    )}
                    <div style={{
                      background: render.status === 'done' || render.status === 'error' ? '#F5F5F8' : '#111',
                      borderRadius: 8, padding: '12px 14px',
                      fontFamily: '"SF Mono", "Fira Code", monospace', fontSize: 11, lineHeight: 1.7,
                      maxHeight: 180, overflowY: 'auto',
                      color: render.status === 'done' || render.status === 'error' ? '#555' : '#888',
                    }}>
                      {render.logs.slice(-25).map((l, i) => (
                        <div key={i} style={{
                          color: l.includes('error') || l.includes('Error') ? '#DC2626'
                            : l.includes('✓') ? '#16A34A'
                            : render.status === 'done' || render.status === 'error' ? '#555' : '#888',
                        }}>{l}</div>
                      ))}
                    </div>
                    {render.outputFile && (
                      <VideoPlayer
                        src={`/api/outputs/${render.outputFile}`}
                        filename={render.outputFile}
                        width={project.width}
                        height={project.height}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   AI Workflow Panel
   ══════════════════════════════════════════════════════════════════ */
function AiPanel({
  aiStep, aiError, aiScript, aiTone, aiProduct, sfxHints,
  voiceOpts, chosenVoice, playingId, confirming,
  hasHtml, projectDuration,
  onAnalyze, onTogglePlay, onConfirm, onReset, onRegenerate, onRender,
  inRender, renderProgress,
}: {
  aiStep: AiStep; aiError: string;
  aiScript: string; aiTone: string; aiProduct: string;
  sfxHints: { at: number; src: string; vol: number }[];
  voiceOpts: VoiceOption[]; chosenVoice: VoiceOption | null;
  playingId: string | null; confirming: boolean;
  hasHtml: boolean; projectDuration: number;
  onAnalyze: () => void; onTogglePlay: (v: VoiceOption) => void;
  onConfirm: (v: VoiceOption) => void; onReset: () => void;
  onRegenerate: () => void; onRender: () => void;
  inRender: boolean; renderProgress: number;
}) {
  const isDark = aiStep === 'confirmed';

  return (
    <div style={{
      background: isDark ? '#161616' : '#fff',
      borderRadius: 14,
      boxShadow: isDark
        ? '0 4px 24px rgba(0,0,0,0.3)'
        : '0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
      overflow: 'hidden',
      transition: 'background 0.3s, box-shadow 0.3s',
    }}>

      {/* Panel header */}
      <div style={{
        padding: '18px 22px',
        borderBottom: `1px solid ${isDark ? '#252525' : '#E4E4E9'}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: isDark ? '#fff' : '#111', letterSpacing: -0.3, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Sparkles size={16} /> Generación con IA
          </div>
          <div style={{ fontSize: 12, color: isDark ? '#888' : '#666', marginTop: 3 }}>
            {aiStep === 'idle'       && 'Claude + ElevenLabs · audio automático'}
            {aiStep === 'analyzing'  && 'Claude está leyendo tu anuncio…'}
            {aiStep === 'generating' && 'ElevenLabs generando opciones de voz…'}
            {aiStep === 'choosing'   && 'Escucha y elige la voz que más te guste'}
            {aiStep === 'confirmed'  && `Listo · ${projectDuration}s · ${sfxHints.length} SFX`}
          </div>
        </div>
        {aiStep !== 'idle' && (
          <button onClick={onReset} style={{
            background: 'transparent',
            border: `1px solid ${isDark ? '#333' : '#D0D0D8'}`,
            borderRadius: 7, padding: '5px 12px', fontSize: 11, cursor: 'pointer',
            color: isDark ? '#888' : '#666', fontWeight: 600,
          }}>
            Reiniciar
          </button>
        )}
      </div>

      <div style={{ padding: 22 }}>

        {/* ── IDLE ──────────────────────────────────────────────── */}
        {aiStep === 'idle' && (
          <div style={{ animation: 'fadeIn 0.25s ease' }}>
            {/* Feature list */}
            <div style={{ marginBottom: 22 }}>
              {[
                { label: 'Claude', desc: 'Analiza el HTML y escribe el guion' },
                { label: 'ElevenLabs', desc: 'Sintetiza 4 voces para que elijas' },
                { label: 'Auto-config', desc: 'Voz + SFX listos para renderizar' },
              ].map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 14px',
                  background: i % 2 === 0 ? '#F8F8FB' : 'transparent',
                  borderRadius: 8,
                  marginBottom: 2,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, background: '#111',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 13, color: '#fff', fontWeight: 800,
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111', lineHeight: 1.3 }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 1 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {aiError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#DC2626', marginBottom: 16 }}>
                {aiError}
              </div>
            )}

            <button
              onClick={onAnalyze}
              disabled={!hasHtml}
              style={{
                width: '100%',
                background: hasHtml ? '#111' : '#E4E4E9',
                color: hasHtml ? '#fff' : '#aaa',
                border: 'none', borderRadius: 10,
                padding: '14px 0', fontSize: 14, fontWeight: 800,
                cursor: hasHtml ? 'pointer' : 'not-allowed',
                letterSpacing: -0.3, transition: 'opacity 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Sparkles size={16} />
              Analizar HTML con IA
            </button>

            {!hasHtml && (
              <div style={{ fontSize: 12, color: '#888', marginTop: 10, textAlign: 'center' }}>
                Selecciona un archivo HTML primero
              </div>
            )}
          </div>
        )}

        {/* ── ANALYZING ─────────────────────────────────────────── */}
        {aiStep === 'analyzing' && (
          <div style={{ textAlign: 'center', padding: '36px 0', animation: 'fadeIn 0.2s ease' }}>
            <div style={{ marginBottom: 18 }}><Spinner /></div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 6 }}>
              Analizando el anuncio…
            </div>
            <div style={{ fontSize: 13, color: '#555' }}>
              Claude detecta producto, tono y tiempo de locución
            </div>
          </div>
        )}

        {/* ── GENERATING ────────────────────────────────────────── */}
        {aiStep === 'generating' && (
          <div style={{ textAlign: 'center', padding: '28px 0', animation: 'fadeIn 0.2s ease' }}>
            <div style={{ marginBottom: 18 }}><Spinner /></div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 6 }}>
              Generando opciones de voz…
            </div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
              ElevenLabs sintetizando 4 voces con{' '}
              <strong style={{ color: '#111' }}>{aiScript.split(' ').length} palabras</strong>
            </div>
            {aiScript && (
              <div style={{
                background: '#F8F8FB', border: '1.5px solid #E4E4E9',
                borderRadius: 10, padding: '14px 16px', textAlign: 'left',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
                  Guion generado
                </div>
                <div style={{ fontSize: 13, color: '#333', lineHeight: 1.65, fontStyle: 'italic' }}>
                  &quot;{aiScript}&quot;
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CHOOSING ──────────────────────────────────────────── */}
        {aiStep === 'choosing' && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>

            {/* Analysis chips */}
            {(aiProduct || aiTone) && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {aiProduct && (
                  <span style={{ background: '#F0F0F5', border: '1px solid #D8D8E4', borderRadius: 20, padding: '4px 11px', fontSize: 12, color: '#333', fontWeight: 500 }}>
                    {aiProduct}
                  </span>
                )}
                {aiTone && (
                  <span style={{ background: '#F0F0F5', border: '1px solid #D8D8E4', borderRadius: 20, padding: '4px 11px', fontSize: 12, color: '#333', fontWeight: 500 }}>
                    {aiTone}
                  </span>
                )}
                {sfxHints.length > 0 && (
                  <span style={{ background: '#F0F0F5', border: '1px solid #D8D8E4', borderRadius: 20, padding: '4px 11px', fontSize: 12, color: '#333', fontWeight: 500 }}>
                    {sfxHints.length} SFX
                  </span>
                )}
              </div>
            )}

            {/* Script preview */}
            <div style={{ background: '#F8F8FB', border: '1.5px solid #E4E4E9', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
                Guion · {aiScript.split(' ').length} palabras
              </div>
              <div style={{ fontSize: 13, color: '#222', lineHeight: 1.65, fontStyle: 'italic' }}>
                &quot;{aiScript}&quot;
              </div>
            </div>

            {aiError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#DC2626', marginBottom: 14 }}>
                {aiError}
              </div>
            )}

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>
                Elige una voz <span style={{ color: '#888', fontWeight: 500 }}>({voiceOpts.length} opciones)</span>
              </div>
              <button onClick={onRegenerate} style={{
                background: 'transparent', border: '1.5px solid #D0D0D8',
                borderRadius: 7, padding: '4px 12px', fontSize: 11,
                cursor: 'pointer', color: '#555', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <RotateCcw size={11} /> Regenerar
              </button>
            </div>

            {/* Voice cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {voiceOpts.map(opt => (
                <VoiceCard
                  key={opt.voiceId}
                  opt={opt}
                  isPlaying={playingId === opt.voiceId}
                  isConfirming={confirming}
                  onPlay={() => onTogglePlay(opt)}
                  onConfirm={() => onConfirm(opt)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── CONFIRMED ─────────────────────────────────────────── */}
        {aiStep === 'confirmed' && chosenVoice && (
          <div style={{ animation: 'fadeIn 0.25s ease' }}>

            {/* Chosen voice badge */}
            <div style={{
              background: '#1E1E1E', border: '1px solid #2E2E2E', borderRadius: 12,
              padding: '16px 18px', marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, background: '#2A2A2A', borderRadius: 10, border: '1px solid #383838',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Mic size={20} color="#888" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                  Voz seleccionada
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chosenVoice.name}
                </div>
              </div>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: '#1a3a1a',
                border: '1.5px solid #2d5c2d', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#4ade80', flexShrink: 0,
              }}>
                <Check size={14} />
              </div>
            </div>

            {/* Summary rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              <SummaryRow icon={<FileText size={12} />} label="Guion" value={`${aiScript.split(' ').length} palabras · tono ${aiTone}`} dark />
              {sfxHints.length > 0 && (
                <SummaryRow icon={<Waves size={12} />} label="Efectos" value={`${sfxHints.length} SFX auto-configurados`} dark />
              )}
              <SummaryRow icon={<Tag size={12} />} label="Producto" value={aiProduct || '—'} dark />
            </div>

            {/* Render CTA */}
            <button
              onClick={onRender}
              disabled={inRender}
              style={{
                width: '100%',
                background: inRender ? '#252525' : '#fff',
                color: inRender ? '#555' : '#111',
                border: 'none', borderRadius: 10,
                padding: '15px 0', fontSize: 15, fontWeight: 900,
                cursor: inRender ? 'not-allowed' : 'pointer',
                letterSpacing: -0.5, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {inRender
                ? <><Spinner color="#555" /> Renderizando {renderProgress}%…</>
                : <><Play size={16} /> Renderizar video</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Voice card ──────────────────────────────────────────────────── */
function VoiceCard({ opt, isPlaying, isConfirming, onPlay, onConfirm }: {
  opt: VoiceOption; isPlaying: boolean; isConfirming: boolean;
  onPlay: () => void; onConfirm: () => void;
}) {
  return (
    <div style={{
      background: isPlaying ? '#F5F5FB' : '#F8F8FB',
      border: isPlaying ? '2px solid #111' : '1.5px solid #E0E0E8',
      borderRadius: 12, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      {/* Voice name */}
      <div style={{ fontWeight: 700, fontSize: 13, color: '#111', letterSpacing: -0.2, lineHeight: 1.2 }}>
        {opt.name}
      </div>

      {/* Play/pause button */}
      <button
        onClick={onPlay}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          background: isPlaying ? '#111' : '#fff',
          border: `1.5px solid ${isPlaying ? '#111' : '#D0D0D8'}`,
          borderRadius: 8, padding: '9px 12px', cursor: 'pointer', width: '100%',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {isPlaying
            ? <Pause size={15} color="#fff" />
            : <Play size={15} color="#111" />
          }
        </span>
        {/* Waveform bars */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
          {Array.from({ length: 18 }, (_, i) => (
            <div key={i} style={{
              width: 2.5, borderRadius: 2, flexShrink: 0,
              height: isPlaying ? `${7 + Math.abs(Math.sin(i * 0.9 + 0.5)) * 9}px` : '3px',
              background: isPlaying ? 'rgba(255,255,255,0.85)' : '#C8C8D0',
              animation: isPlaying ? `pulse ${0.35 + (i % 4) * 0.12}s ease-in-out infinite` : 'none',
              transition: 'height 0.15s',
            }} />
          ))}
        </div>
        <span style={{ fontSize: 10, color: isPlaying ? 'rgba(255,255,255,0.7)' : '#888', fontWeight: 600, flexShrink: 0 }}>
          {isPlaying ? 'Escucha' : 'Preview'}
        </span>
      </button>

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        disabled={isConfirming}
        style={{
          background: '#111', color: '#fff', border: 'none', borderRadius: 8,
          padding: '9px 0', fontSize: 12, fontWeight: 700,
          cursor: isConfirming ? 'not-allowed' : 'pointer',
          width: '100%', opacity: isConfirming ? 0.45 : 1,
          transition: 'opacity 0.15s',
          letterSpacing: 0.1,
        }}
      >
        {isConfirming ? 'Confirmando…' : 'Usar esta voz'}
      </button>
    </div>
  );
}

/* ── Summary row ─────────────────────────────────────────────────── */
function SummaryRow({ icon, label, value, dark }: { icon: React.ReactNode; label: string; value: string; dark?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: dark ? '#1E1E1E' : '#F8F8FB',
      border: `1px solid ${dark ? '#2A2A2A' : '#E4E4E9'}`,
      borderRadius: 8, padding: '9px 12px',
    }}>
      <span style={{ color: dark ? '#666' : '#aaa', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ fontSize: 11, color: dark ? '#999' : '#777', fontWeight: 700, width: 68, flexShrink: 0, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: dark ? '#ccc' : '#444', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {value}
      </span>
    </div>
  );
}

/* ── Video Player ────────────────────────────────────────────────── */
function VideoPlayer({ src, filename, width, height }: {
  src: string; filename: string; width: number; height: number;
}) {
  const aspect = width && height ? `${width} / ${height}` : '16 / 9';
  return (
    <div style={{ marginTop: 14, animation: 'fadeIn 0.3s ease' }}>
      {/* Video */}
      <div style={{
        borderRadius: 8, overflow: 'hidden', background: '#000',
        aspectRatio: aspect, width: '100%',
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
      }}>
        <video
          key={src}
          src={src}
          controls
          autoPlay
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
        />
      </div>

      {/* Footer: info + download */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 10, gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {filename}
          </div>
          {width && height && (
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              {width} × {height} px
            </div>
          )}
        </div>
        <a
          href={src}
          download={filename}
          style={{
            flexShrink: 0,
            background: '#252525', color: '#e0e0e0',
            border: '1px solid #333', borderRadius: 7,
            padding: '7px 14px', fontSize: 12, fontWeight: 600,
            textDecoration: 'none', whiteSpace: 'nowrap',
            transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Download size={13} /> Descargar
        </a>
      </div>
    </div>
  );
}

/* ── Timeline ─────────────────────────────────────────────────────── */
function Timeline({ project }: { project: { duration: number; voice: AudioCue[]; sfx: AudioCue[] } }) {
  const dur  = project.duration;
  const rows = [
    ...project.voice.map(c => ({ ...c, kind: 'voice' as const })),
    ...project.sfx.map(c   => ({ ...c, kind: 'sfx'   as const })),
  ].sort((a, b) => a.at - b.at);
  const ticks = Math.ceil(dur / 5) + 1;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', marginBottom: 6, paddingLeft: 84 }}>
        {Array.from({ length: ticks }, (_, i) => (
          <div key={i} style={{
            flex: i === ticks - 1 ? 0 : 1, fontSize: 10, color: '#999',
            borderLeft: '1px solid #E4E4E9', paddingLeft: 4, minWidth: 0,
          }}>{i * 5}s</div>
        ))}
      </div>
      {rows.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
          <div style={{ width: 80, fontSize: 10, color: '#777', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}
            title={c.src}>{c.src.split('/').pop()}</div>
          <div style={{ flex: 1, position: 'relative', height: 16 }}>
            <div style={{ position: 'absolute', inset: '5px 0', background: '#EBEBEF', borderRadius: 2 }} />
            <div style={{
              position: 'absolute',
              left: `${Math.min((c.at / dur) * 100, 100)}%`,
              top: 1, bottom: 1, width: 10, borderRadius: 3,
              background: c.kind === 'voice' ? '#111' : '#555',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} title={`${c.at}s — vol ${c.vol}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
