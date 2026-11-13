import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

dotenv.config();

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));

// Health and API status
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'ok',
    ttsEngine: 'google-translate-tts',
    mp4Export: true,
  });
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

async function fetchTtsChunkWithRetry(chunkText: string, tl: string): Promise<string> {
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    chunkText
  )}&tl=${encodeURIComponent(tl)}&client=tw-ob`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(ttsUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(`Sintesi audio temporaneamente non disponibile (HTTP ${response.status}).`);
      }

      const arrBuf = await response.arrayBuffer();
      if (!arrBuf || arrBuf.byteLength === 0) {
        throw new Error('Flusso audio ricevuto vuoto.');
      }
      return Buffer.from(arrBuf).toString('base64');
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  throw lastError || new Error('Errore durante il recupero audio TTS.');
}

// Zero-config, zero-token Google Studio TTS audio endpoint
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
    for (let i = 0; i < textChunks.length; i += 3) {
      const batch = textChunks.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map((chunkText) => fetchTtsChunkWithRetry(chunkText, tl))
      );
      audioChunks.push(...batchResults);
    }

    return res.json({
      chunks: audioChunks,
      mimeType: 'audio/mpeg',
      lang: tl,
    });
  } catch (error: any) {
    console.error('Errore /api/free-tts:', error);
    return res.status(502).json({
      error: error?.message || 'Errore durante la generazione audio.',
    });
  }
});

// Universal MP4 (H.264 + AAC Stereo 44.1kHz) muxer & transcoder so exported video & audio work in EVERY external player
app.post('/api/export-mp4', express.json({ limit: '250mb' }), async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), `tgstudio-export-${crypto.randomUUID()}`);

  try {
    const { videoBase64, videoFormat = 'webm', audioChunks } = req.body || {};
    if (!videoBase64 || typeof videoBase64 !== 'string') {
      return res.status(400).json({ error: 'Dati video mancanti per esportazione MP4.' });
    }

    await fs.promises.mkdir(tmpDir, { recursive: true });
    const safeExt = videoFormat === 'mp4' ? 'mp4' : 'webm';
    const inputVideoPath = path.join(tmpDir, `input.${safeExt}`);
    const outputMp4Path = path.join(tmpDir, 'output.mp4');

    await fs.promises.writeFile(inputVideoPath, Buffer.from(videoBase64, 'base64'));

    const validChunks = Array.isArray(audioChunks)
      ? audioChunks.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : [];

    let hasAudioOutput = false;

    if (validChunks.length > 0) {
      const concatEntries: string[] = [];
      for (let i = 0; i < validChunks.length; i++) {
        const chunkPath = path.join(tmpDir, `chunk_${i}.mp3`);
        await fs.promises.writeFile(chunkPath, Buffer.from(validChunks[i], 'base64'));
        concatEntries.push(`file '${chunkPath.replace(/'/g, "'\\''")}'`);
      }

      const concatListPath = path.join(tmpDir, 'concat.txt');
      await fs.promises.writeFile(concatListPath, concatEntries.join('\n') + '\n', 'utf-8');

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-fflags', '+genpts',
          '-i', inputVideoPath,
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListPath,
          '-filter_complex', '[1:a]aresample=async=1:first_pts=0,apad[aout]',
          '-map', '0:v:0',
          '-map', '[aout]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '22',
          '-pix_fmt', 'yuv420p',
          '-vsync', 'cfr',
          '-r', '30',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          '-ac', '2',
          '-shortest',
          '-movflags', '+faststart',
          outputMp4Path,
        ],
        { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
      );
      hasAudioOutput = true;
    } else {
      // Check if input video itself has an audio stream
      let inputHasAudio = false;
      try {
        const { stdout } = await execFileAsync('ffprobe', [
          '-v', 'error',
          '-select_streams', 'a',
          '-show_entries', 'stream=codec_type',
          '-of', 'csv=p=0',
          inputVideoPath,
        ]);
        inputHasAudio = stdout.trim().includes('audio');
      } catch {
        inputHasAudio = false;
      }

      const ffmpegArgs = [
        '-y',
        '-fflags', '+genpts',
        '-i', inputVideoPath,
        '-map', '0:v:0',
        ...(inputHasAudio ? ['-map', '0:a:0'] : []),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-vsync', 'cfr',
        '-r', '30',
        ...(inputHasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2'] : []),
        '-movflags', '+faststart',
        outputMp4Path,
      ];

      await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
      hasAudioOutput = inputHasAudio;
    }

    const mp4Buffer = await fs.promises.readFile(outputMp4Path);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(mp4Buffer.length));
    res.setHeader('X-Has-Audio', hasAudioOutput ? 'true' : 'false');
    return res.send(mp4Buffer);
  } catch (error: any) {
    console.error('Errore /api/export-mp4:', error);
    return res.status(500).json({
      error: error?.message || 'Errore durante la conversione MP4 con FFmpeg.',
    });
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const httpServer = http.createServer(app);

  if (!isProduction) {
    app.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`StudioTG News Server avviato su http://0.0.0.0:${PORT} [${isProduction ? 'PROD' : 'DEV'}]`);
  });
}

startServer().catch((err) => {
  console.error('Impossibile avviare il server:', err);
});
