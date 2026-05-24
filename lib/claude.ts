// lib/claude.ts — cliente Anthropic para análisis de anuncios
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'your_key_here') throw new Error('Falta ANTHROPIC_API_KEY en .env.local');
  return new Anthropic({ apiKey: key });
}

export interface SfxSuggestion {
  at: number;
  src: string;   // relativo a uploads/
  vol: number;
}

export interface AdAnalysis {
  script: string;            // texto para la locución
  tone: string;              // profesional | amigable | energético | cálido
  language: string;          // es | en | ...
  productDescription: string;// qué se anuncia
  sfxSuggestions: SfxSuggestion[];
}

export async function analyzeAdHtml(
  htmlContent: string,
  duration: number,
  availableSounds: string[],    // archivos en uploads/sounds/
): Promise<AdAnalysis> {
  const client = getClient();

  // 130 wpm natural → ~2.17 palabras/seg, dejamos 80% del tiempo
  const targetWords = Math.max(8, Math.round(duration * 2.17 * 0.80));

  // Limita el HTML para no gastar demasiados tokens (el HTML de ads puede ser largo)
  const htmlSnippet = htmlContent.length > 7000
    ? htmlContent.slice(0, 7000) + '\n... [truncado]'
    : htmlContent;

  const soundsList = availableSounds.length > 0
    ? availableSounds.map(s => `sounds/${s}`).join(', ')
    : 'ninguno disponible';

  const prompt = `Eres un experto en publicidad y copywriting. Analiza este HTML de un anuncio animado.

=== HTML DEL ANUNCIO ===
${htmlSnippet}
========================

DURACIÓN DEL VIDEO: ${duration} segundos
PALABRAS OBJETIVO DEL SCRIPT: ${targetWords} palabras (ritmo natural de locución)
ARCHIVOS DE SONIDO DISPONIBLES: ${soundsList}

Tu tarea:
1. Entiende qué producto/servicio/marca se está anunciando
2. Identifica el idioma del anuncio (texto visible en el HTML)
3. Escribe el script de locución en ese mismo idioma, EXACTAMENTE ${targetWords} palabras (±3)
4. El script debe sonar natural cuando se lee en voz alta
5. Incluir el call-to-action que aparece en el anuncio
6. Sugiere efectos de sonido CON TIMING PRECISO usando solo los archivos disponibles

RESPONDE ÚNICAMENTE CON JSON VÁLIDO (sin markdown, sin explicaciones):
{
  "script": "texto completo de la locución",
  "tone": "profesional",
  "language": "es",
  "productDescription": "descripción breve de lo que se anuncia",
  "sfxSuggestions": [
    {"at": 0.5, "src": "sounds/nombre.mp3", "vol": 0.55}
  ]
}

Reglas estrictas:
- script EXACTAMENTE ${targetWords} palabras (cuenta bien)
- Solo usa SFX de los archivos disponibles, si no hay ninguno sfxSuggestions = []
- El JSON debe ser parseable con JSON.parse()`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

  // Limpia si viene con markdown code block
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned) as AdAnalysis;
  } catch {
    throw new Error(`Claude devolvió JSON inválido: ${cleaned.slice(0, 200)}`);
  }
}
