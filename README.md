# Ad Studio — Generador Personal de Anuncios en Video

## Inicio rapido

```
npm run dev
# http://localhost:3000
```

## Donde se guardan los videos

**`data/outputs/<nombre>.mp4`**

Por ejemplo: si tu HTML es `feed-1-automatiza.html` el video queda en
`C:\Users\DELL\Escritorio\ad-studio\data\outputs\feed-1-automatiza.mp4`

Tambien puedes descargarlo directo desde la UI (link verde en la tarjeta del proyecto).

## Estructura

```
ad-studio/
  public/ads/      <- HTMLs animados (iframe preview)
  uploads/
    voice/         <- .mp3 de voz (ElevenLabs)
    sounds/        <- SFX / efectos .mp3
  data/
    projects/      <- Un JSON por proyecto
    outputs/       <- MP4 generados aqui
  engine/          <- Playwright + FFmpeg
  app/             <- UI Next.js
```

## Configuracion ElevenLabs

Edita `.env.local`:
```
ELEVENLABS_API_KEY=tu_key_aqui
ANTHROPIC_API_KEY=tu_key_aqui
```

## Importar configs del pipeline anterior

```
npm run import-configs C:\ruta\a\configs
```
