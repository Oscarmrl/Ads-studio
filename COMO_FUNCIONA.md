# Ad Studio — Cómo funciona

Sistema personal para convertir animaciones HTML en videos MP4 con audio generado automáticamente por IA.

---

## Qué hace

1. Tomas un archivo HTML con una animación en JavaScript/CSS
2. La IA analiza qué anuncia, escribe el guion de locución y sugiere efectos de sonido
3. ElevenLabs sintetiza el guion con 4 voces distintas para que elijas
4. Confirmas la voz que más te gusta
5. El sistema graba la animación como video y le mezcla el audio → MP4 listo

---

## Flujo completo paso a paso

```
HTML animado
    │
    ▼
[Claude AI] analiza el contenido
    │  devuelve: script, tono, producto, SFX sugeridos
    ▼
[ElevenLabs] sintetiza el script con 4 voces distintas
    │  guarda previews en public/previews/<projectId>/
    ▼
Usuario escucha y elige una voz
    │
    ▼
[Confirmar] copia la voz a uploads/voice/ y actualiza el proyecto
    │
    ▼
[Playwright] abre el HTML en Chromium headless y lo graba → .webm
    │
    ▼
[FFmpeg] mezcla el .webm + voz + SFX → .mp4 final
    │
    ▼
data/outputs/<nombre>.mp4  ✓
```

---

## Tecnologías

| Herramienta | Para qué |
|---|---|
| Next.js 14 (App Router) | UI + API routes |
| Playwright (Chromium) | Grabar el HTML como video |
| FFmpeg (ffmpeg-static) | Mezclar video + audio → MP4 |
| Anthropic Claude (`claude-sonnet-4-6`) | Analizar el HTML y generar el guion |
| ElevenLabs | Convertir el guion a voz (TTS) |

---

## Estructura de carpetas

```
ad-studio/
├── app/
│   ├── page.tsx                    → redirige al dashboard
│   ├── dashboard.tsx               → lista de proyectos
│   ├── project/[id]/page.tsx       → editor de proyecto (pantalla principal)
│   └── api/
│       ├── projects/               → CRUD de proyectos (GET, POST, PATCH, DELETE)
│       ├── upload-html/            → subir/listar HTMLs (GET, POST)
│       ├── parse-html/             → auto-detectar dimensiones y duración del HTML
│       ├── render/                 → iniciar render (POST) y seguimiento SSE (GET)
│       ├── outputs/[file]/         → descargar el MP4 generado
│       ├── ai/analyze/             → Claude analiza el HTML → script + SFX
│       ├── ai/voice-options/       → ElevenLabs genera 4 voces de prueba
│       ├── ai/confirm/             → confirma la voz elegida y actualiza el proyecto
│       └── test-elevenlabs/        → diagnóstico de la API key de ElevenLabs
│
├── engine/
│   ├── record.ts                   → Playwright: HTML → WebM
│   ├── mix.ts                      → FFmpeg: WebM + audio → MP4
│   └── pipeline.ts                 → orquestador de record + mix
│
├── lib/
│   ├── store.ts                    → persistencia en JSON (sin base de datos)
│   ├── claude.ts                   → cliente Anthropic: analyzeAdHtml()
│   ├── elevenlabs.ts               → cliente ElevenLabs: listVoices(), textToSpeech()
│   ├── render-manager.ts           → registro de jobs en memoria + SSE
│   └── parse-html-meta.ts          → extrae width/height/duration del HTML
│
├── public/
│   ├── ads/                        → HTMLs subidos (se sirven para iframe preview)
│   └── previews/<projectId>/       → audios de prueba de voces (temporal)
│
├── uploads/
│   ├── voice/                      → voz confirmada (ai_voice_<id>.mp3)
│   └── sounds/                     → efectos de sonido disponibles para SFX
│
├── data/
│   ├── projects/<uuid>.json        → un archivo JSON por proyecto
│   └── outputs/<nombre>.mp4        → videos generados
│
└── .env.local                      → API keys (no subir a git)
```

---

## Variables de entorno (.env.local)

```env
ELEVENLABS_API_KEY=sk_...    # API key con permisos voices_read + text_to_speech
ANTHROPIC_API_KEY=sk-ant-... # API key de Claude
```

---

## API Routes

### Proyectos

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/projects` | Lista todos los proyectos |
| POST | `/api/projects` | Crea un proyecto nuevo |
| GET | `/api/projects/[id]` | Obtiene un proyecto |
| PATCH | `/api/projects/[id]` | Actualiza campos del proyecto |
| DELETE | `/api/projects/[id]` | Elimina el proyecto |

### HTML

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/upload-html` | Lista HTMLs disponibles en public/ads/ |
| POST | `/api/upload-html` | Sube un .html a public/ads/ |
| GET | `/api/parse-html?file=nombre.html` | Detecta width, height y duration del HTML |

### IA

| Método | Ruta | Body | Qué hace |
|---|---|---|---|
| POST | `/api/ai/analyze` | `{ projectId }` | Claude lee el HTML y devuelve script + sfxSuggestions |
| POST | `/api/ai/voice-options` | `{ script, projectId }` | Genera audio del script con 4 voces de ElevenLabs |
| POST | `/api/ai/confirm` | `{ projectId, voiceId, voiceName, sfxSuggestions }` | Copia la voz elegida y actualiza el proyecto |

### Render

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/render` | Inicia el pipeline (devuelve `{ jobId }` inmediatamente) |
| GET | `/api/render/[jobId]` | Stream SSE con progreso en tiempo real |
| GET | `/api/outputs/[file]` | Descarga el MP4 generado |

---

## Modelo de datos — Proyecto

```typescript
interface Project {
  id: string;           // UUID
  name: string;         // nombre del proyecto
  html: string;         // nombre del archivo en public/ads/  (ej: "anuncio.html")
  duration: number;     // duración del video en segundos
  width: number;        // ancho en px
  height: number;       // alto en px
  voice: AudioCue[];    // pistas de voz [{ at, src, vol }]
  sfx: AudioCue[];      // efectos de sonido [{ at, src, vol }]
  lastOutput?: string;  // nombre del último MP4 generado
  createdAt: string;
  updatedAt: string;
}

interface AudioCue {
  at: number;   // segundo en que entra el audio
  src: string;  // ruta relativa a uploads/  (ej: "voice/ai_voice_abc123.mp3")
  vol: number;  // volumen 0.0 – 1.0
}
```

---

## Cómo se detecta la duración del HTML

`lib/parse-html-meta.ts` usa esta cadena de prioridad:

1. Atributo `data-duration` en el `<body>`
2. Variable JS `const DURATION = X`
3. Mayor `setTimeout` encontrado en el código (ms → s + 1.5s de margen)
4. Animaciones CSS de entrada (`animation-fill-mode: both/forwards`) — máx 30s por animación
5. Fallback por formato: feed=8s · story=10s · banner=10s

Fórmula final: `max(ceil(duracionDetectada) + 3, minimoDeFormato)`

---

## Cómo se genera el audio automáticamente

### 1. Claude analiza el HTML (`/api/ai/analyze`)

- Lee el HTML desde `public/ads/<nombre>.html`
- Escanea `uploads/sounds/` para saber qué SFX hay disponibles
- Calcula palabras objetivo: `duración × 2.17 palabras/seg × 80%`
- Envía el HTML + instrucciones a `claude-sonnet-4-6`
- Claude devuelve JSON con:
  - `script` — el guion de locución (palabras exactas)
  - `tone` — tono detectado (profesional, amigable, energético…)
  - `language` — idioma del anuncio
  - `productDescription` — qué se anuncia
  - `sfxSuggestions` — array de `{ at, src, vol }` con efectos sugeridos

### 2. ElevenLabs genera las opciones (`/api/ai/voice-options`)

- Selecciona hasta 4 voces diversas de la cuenta (2 premade + 1 cloned + 1 generated)
- Genera el audio **secuencialmente** (no en paralelo) para evitar rate limits
- Prueba modelos en orden de compatibilidad:
  `eleven_multilingual_v2` → `eleven_turbo_v2_5` → `eleven_turbo_v2` → `eleven_multilingual_v1` → `eleven_monolingual_v1`
- Guarda cada MP3 en `public/previews/<projectId>/<voiceId>.mp3`
- Si una voz falla, la omite (no cancela el resto)
- Devuelve array de `VoiceOption` con URL pública para reproducir en el browser

### 3. Confirmar la voz (`/api/ai/confirm`)

- Copia el preview elegido a `uploads/voice/ai_voice_<shortId>.mp3`
- Actualiza el proyecto con:
  - `voice: [{ at: 0.3, src: "voice/ai_voice_xxx.mp3", vol: 0.92 }]`
  - `sfx: [ ...sfxSuggestions ]`
- Limpia el directorio `public/previews/<projectId>/`

---

## Cómo se graba el video (Playwright)

`engine/record.ts`:

1. Lanza Chromium headless con `playwright`
2. Configura viewport al tamaño exacto del anuncio (width × height)
3. Abre el HTML via `file:///` URL
4. Espera 400ms para que la página cargue completamente
5. Espera `duration + 1` segundos (graba la animación completa)
6. Cierra el contexto → Playwright guarda el video como `.webm`
7. Mueve el `.webm` al path de salida y limpia temporales

---

## Cómo se mezcla el audio (FFmpeg)

`engine/mix.ts` construye un comando FFmpeg con `filter_complex`:

```
ffmpeg -i video.webm -i voz.mp3 -i sfx1.mp3 ...
  -filter_complex "
    [1:a]adelay=300|300,volume=0.92[a0];
    [2:a]adelay=1500|1500,volume=0.55[a1];
    [a0][a1]amix=inputs=2:duration=longest:normalize=0[aout]
  "
  -map 0:v -map [aout]
  -c:v libx264 -crf 18 -preset fast
  -c:a aac -b:a 192k
  -t <duracion>
  output.mp4
```

- `adelay` coloca cada pista en su segundo exacto
- `amix` mezcla todas las pistas sin normalizar (preserva volúmenes configurados)
- Video: H.264 CRF 18 (alta calidad) + `faststart` (streamable)
- Audio: AAC 192kbps

---

## Progreso en tiempo real (SSE)

El render es asíncrono:

1. `POST /api/render` inicia el pipeline y devuelve `{ jobId }` inmediatamente (HTTP 202)
2. El browser abre `GET /api/render/[jobId]` como `EventSource`
3. El pipeline llama `pushLog()` en cada paso → el stream SSE lo envía al browser
4. Cuando termina (status `done` o `error`), el stream se cierra

---

## Persistencia (sin base de datos)

Cada proyecto es un archivo JSON en `data/projects/<uuid>.json`.  
`lib/store.ts` expone: `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`.

---

## Ejecutar el proyecto

```bash
# Instalar dependencias
npm install

# Configurar API keys
# Editar .env.local con ELEVENLABS_API_KEY y ANTHROPIC_API_KEY

# Desarrollo
npm run dev
# → http://localhost:3000

# Verificar conexión con ElevenLabs
# → http://localhost:3000/api/test-elevenlabs
```

---

## Lo que NO hace (limitaciones actuales)

- No tiene autenticación — es para uso local personal
- No soporta múltiples usuarios simultáneos (render bloqueante por proyecto)
- No genera música de fondo — solo voz + SFX de archivos en `uploads/sounds/`
- Los SFX deben subirse manualmente a `uploads/sounds/` (la IA los sugiere pero no los descarga)
- No hay preview de video antes de renderizar — solo preview del HTML
