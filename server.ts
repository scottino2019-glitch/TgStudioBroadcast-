import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));

// Shared server-side Gemini client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1alpha',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Health and API status
app.get('/api/status', (_req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    status: 'ok',
    hasApiKey: hasKey,
    supportedVoices: ['Kore', 'Puck', 'Fenrir', 'Zephyr', 'Charon'],
    defaultModel: 'gemini-3.8-flash-lite-tts',
  });
});

// Text-to-Speech Endpoint using Gemini 3.8 Flash Lite TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = 'Kore', style = 'Clear, authoritative TV news anchor with crisp articulation' } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Testo mancante o non valido per la sintesi vocale.' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Chiave API non configurata nel server. Usa il fallback vocale Web Speech o configura la chiave nei Secrets.',
      });
    }

    const validVoices = ['Kore', 'Puck', 'Fenrir', 'Zephyr', 'Charon'];
    const chosenVoice = validVoices.includes(voice) ? voice : 'Kore';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: text.trim(),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: chosenVoice },
          },
        },
      },
    });

    const candidate = response.candidates?.[0];
    const audioData = candidate?.content?.parts?.[0]?.inlineData?.data;
    const mimeType = candidate?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/wav';

    if (!audioData) {
      return res.status(502).json({
        error: 'Nessun flusso audio generato dal modello vocale.',
        details: candidate?.finishReason || 'Part inlineData vuoto',
      });
    }

    return res.json({
      audioBase64: audioData,
      mimeType,
      voice: chosenVoice,
    });
  } catch (error: any) {
    console.error('Errore TTS Gemini:', error);
    return res.status(500).json({
      error: error?.message || 'Errore durante la generazione della voce sintetica.',
      code: error?.status || 500,
    });
  }
});

function splitTextForTtsChunks(text: string, maxLen = 170): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const sentences = cleaned.match(/[^.!?;:。！？；]+[.!?;:。！？；]*/g) || [cleaned];
  const chunks: string[] = [];
  let buffer = '';

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length > maxLen) {
      if (buffer) {
        chunks.push(buffer.trim());
        buffer = '';
      }
      const words = sentence.split(/\s+/);
      let wordBuf = '';
      for (const word of words) {
        if ((wordBuf + ' ' + word).trim().length <= maxLen) {
          wordBuf = (wordBuf + ' ' + word).trim();
        } else {
          if (wordBuf) chunks.push(wordBuf);
          wordBuf = word.slice(0, maxLen);
        }
      }
      if (wordBuf) chunks.push(wordBuf);
      continue;
    }

    if ((buffer + ' ' + sentence).trim().length <= maxLen) {
      buffer = (buffer + ' ' + sentence).trim();
    } else {
      if (buffer) chunks.push(buffer.trim());
      buffer = sentence;
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks;
}

function mapToGoogleTtsLang(langTag: string | undefined): string {
  const norm = (langTag || 'it-IT').trim().replace(/_/g, '-');
  const lower = norm.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower === 'en-gb') return 'en-GB';
  return lower.split('-')[0] || 'it';
}

// Zero-config, zero-token Google Studio TTS audio endpoint (returns MP3 chunks recordable in MediaRecorder)
app.post('/api/free-tts', async (req, res) => {
  try {
    const { text, lang = 'it-IT' } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Testo mancante per la sintesi vocale.' });
    }

    const tl = mapToGoogleTtsLang(lang);
    const textChunks = splitTextForTtsChunks(text, 170);
    if (textChunks.length === 0) {
      return res.status(400).json({ error: 'Copione vuoto.' });
    }

    const audioChunks: string[] = [];
    for (const chunkText of textChunks) {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
        chunkText
      )}&tl=${encodeURIComponent(tl)}&client=tw-ob`;

      const response = await fetch(ttsUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        return res.status(502).json({
          error: `Sintesi audio temporaneamente non disponibile (HTTP ${response.status}).`,
        });
      }

      const arrBuf = await response.arrayBuffer();
      if (!arrBuf || arrBuf.byteLength === 0) {
        return res.status(502).json({ error: 'Flusso audio ricevuto vuoto.' });
      }
      audioChunks.push(Buffer.from(arrBuf).toString('base64'));
    }

    return res.json({
      chunks: audioChunks,
      mimeType: 'audio/mpeg',
      lang: tl,
    });
  } catch (error: any) {
    console.error('Errore /api/free-tts:', error);
    return res.status(500).json({
      error: error?.message || 'Errore durante la generazione audio.',
    });
  }
});

// AI News Script Generator
app.post('/api/generate-news', async (req, res) => {
  const { topic, language = 'Italian', tone = 'authoritative', anchorGender = 'male' } = req.body;
  try {
    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Chiave API non configurata nel server.',
      });
    }

    const prompt = `You are a chief TV news producer and teleprompter editor.
Draft a complete, realistic, professional broadcast news bulletin segment on: "${topic || 'Ultime notizie del giorno e innovazioni tecnologiche'}".
Target Language: ${language}.
Tone: ${tone} (e.g. authoritative, breaking news, international diplomacy, technology).
Anchor gender context: ${anchorGender}.

Return STRICT JSON matching this schema:
{
  "headline": "A short, punchy broadcast headline for the lower-third banner (max 10 words)",
  "subheadline": "Contextual subtitle or location (e.g. ROMA · ORE 20:00 or TOKYO · SUMMIT GLOBALE)",
  "category": "1-2 words category badge (e.g. ULTIM'ORA, ESTERI, ECONOMIA, SCIENZA, CULTURA, SPORT)",
  "ticker": "A continuous text string for the scrolling bottom ticker with 3-4 news updates separated by ' • '",
  "teleprompterScript": "A broadcast speech ready for natural reading by the news anchor. Exactly 45 to 80 words. Flowing, engaging television news language with natural pauses.",
  "pipTopic": "Short topic label for the over-the-shoulder Picture-in-Picture graphic (max 3 words)"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.warn('Fallback generazione notizie:', error?.message);
    const cleanTopic = (topic || 'Innovazione e Sviluppo').trim();
    return res.json({
      headline: `ULTIME NOTIZIE: IMPORTANTE SVOLTA SU ${cleanTopic.toUpperCase()}`,
      subheadline: "ROMA · ORE 20:00 · DIRETTA CENTRALE TG",
      category: "ULTIM'ORA",
      ticker: `TG FLASH: ULTIMI SVILUPPI SU ${cleanTopic.toUpperCase()} • MERCATI IN RIALZO A MILANO E FRANCOFORTE • AGGIORNAMENTI IN CORSO`,
      teleprompterScript: `Buonasera e benvenuti al telegiornale. Apriamo questa edizione con importanti aggiornamenti su ${cleanTopic}. Dalle prime informazioni giunte in redazione, si registrano sviluppi significativi che stiamo seguendo con i nostri inviati sul campo. Restate collegati per tutti gli approfondimenti in diretta.`,
      pipTopic: cleanTopic.slice(0, 14).toUpperCase(),
    });
  }
});

// AI Script Translator
app.post('/api/translate-script', async (req, res) => {
  const { script, headline, ticker, targetLanguage } = req.body;
  try {
    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Chiave API non configurata nel server.',
      });
    }

    const prompt = `Translate and adapt the following TV news broadcast text into natural, idiomatically accurate broadcast ${targetLanguage}. Keep the professional TV anchor rhythm.

Headline: ${headline || ''}
Ticker: ${ticker || ''}
Script: ${script || ''}

Return STRICT JSON:
{
  "headline": "translated headline",
  "ticker": "translated ticker",
  "teleprompterScript": "translated speech script for the anchor"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.warn('Fallback traduzione copione:', error?.message);
    return res.json({
      headline: headline || 'SPECIAL BROADCAST',
      ticker: ticker || 'BREAKING NEWS UPDATE',
      teleprompterScript: script || 'Good evening and welcome to our world news broadcast.',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (!isProduction) {
    app.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StudioTG News Server avviato su http://0.0.0.0:${PORT} [${isProduction ? 'PROD' : 'DEV'}]`);
  });
}

startServer().catch((err) => {
  console.error('Impossibile avviare il server:', err);
});
