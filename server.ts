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

const defaultJsonParser = express.json({ limit: '10mb' });
app.use((req, res, next) => {
  if (req.path === '/api/export-mp4') return next();
  return defaultJsonParser(req, res, next);
});

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

const MAX_TTS_CACHE = 120;
const ttsChunkCache = new Map<string, string>();

function setTtsCache(key: string, value: string) {
  if (!ttsChunkCache.has(key) && ttsChunkCache.size >= MAX_TTS_CACHE) {
    const oldestKey = ttsChunkCache.keys().next().value;
    if (oldestKey) ttsChunkCache.delete(oldestKey);
  }
  ttsChunkCache.set(key, value);
}

function sanitizeTextForTts(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSpeakableContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

async function synthesizeFliteMp3Fallback(text: string): Promise<string> {
  const safeText =
    sanitizeTextForTts(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ,.?!;:'"-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Notiziario in onda';

  const id = crypto.randomUUID();
  const tmpTxtFile = path.join(os.tmpdir(), `tgstudio-flite-${id}.txt`);
  const tmpMp3File = path.join(os.tmpdir(), `tgstudio-flite-${id}.mp3`);
  try {
    await fs.promises.writeFile(tmpTxtFile, safeText, 'utf-8');
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi',
        '-i', `flite=textfile=${tmpTxtFile.replace(/\\/g, '/').replace(/:/g, '\\:')}`,
        '-ar', '24000',
        '-ac', '1',
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        tmpMp3File,
      ],
      { timeout: 15000 }
    );
    const buf = await fs.promises.readFile(tmpMp3File);
    if (!buf || buf.length === 0) {
      throw new Error('Flite fallback audio vuoto.');
    }
    return buf.toString('base64');
  } finally {
    fs.promises.rm(tmpTxtFile, { force: true }).catch(() => {});
    fs.promises.rm(tmpMp3File, { force: true }).catch(() => {});
  }
}

async function applyVocalShapingMp3(
  rawBase64: string,
  pitch: number,
  rate: number
): Promise<string> {
  const safePitch = Math.max(0.72, Math.min(1.35, Number.isFinite(pitch) ? pitch : 1.0));
  const safeRate = Math.max(0.78, Math.min(1.3, Number.isFinite(rate) ? rate : 1.0));

  if (Math.abs(safePitch - 1.0) < 0.02 && Math.abs(safeRate - 1.0) < 0.02) {
    return rawBase64;
  }

  const id = crypto.randomUUID();
  const inFile = path.join(os.tmpdir(), `tgstudio-raw-${id}.mp3`);
  const outFile = path.join(os.tmpdir(), `tgstudio-shaped-${id}.mp3`);

  try {
    await fs.promises.writeFile(inFile, Buffer.from(rawBase64, 'base64'));
    const eqFilter =
      safePitch < 0.94
        ? ',highpass=f=80,bass=g=2.5:f=140'
        : safePitch > 1.03
        ? ',highpass=f=95,treble=g=2:f=3200'
        : '';
    const filterChain = `rubberband=pitch=${safePitch.toFixed(3)}:tempo=${safeRate.toFixed(3)}${eqFilter}`;

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i', inFile,
        '-af', filterChain,
        '-ar', '24000',
        '-ac', '1',
        '-c:a', 'libmp3lame',
        '-b:a', '96k',
        outFile,
      ],
      { timeout: 15000 }
    );

    const shapedBuf = await fs.promises.readFile(outFile);
    if (!shapedBuf || shapedBuf.length < 128) {
      return rawBase64;
    }
    return shapedBuf.toString('base64');
  } catch (err: any) {
    console.warn('Vocal shaping FFmpeg saltato, uso audio originale:', err?.message);
    return rawBase64;
  } finally {
    fs.promises.rm(inFile, { force: true }).catch(() => {});
    fs.promises.rm(outFile, { force: true }).catch(() => {});
  }
}

async function fetchTtsChunkWithFallback(
  chunkText: string,
  tl: string,
  pitch = 1.0,
  rate = 1.0
): Promise<string> {
  const cleanChunk = sanitizeTextForTts(chunkText);
  const pKey = pitch.toFixed(2);
  const rKey = rate.toFixed(2);
  const shapedCacheKey = `${tl}:p${pKey}:r${rKey}:${cleanChunk}`;
  const shapedCached = ttsChunkCache.get(shapedCacheKey);
  if (shapedCached) {
    return shapedCached;
  }

  const rawCacheKey = `raw:${tl}:${cleanChunk}`;
  let rawBase64 = ttsChunkCache.get(rawCacheKey);

  if (!rawBase64) {
    const encoded = encodeURIComponent(cleanChunk);
    const endpoints = [
      `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${encodeURIComponent(tl)}&client=gtx`,
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${encodeURIComponent(tl)}&client=dict-chrome-ex`,
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${encodeURIComponent(tl)}&client=tw-ob`,
    ];

    let lastError: Error | null = null;
    for (const ttsUrl of endpoints) {
      try {
        const response = await fetch(ttsUrl, {
          signal: AbortSignal.timeout(4500),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
          },
        });

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.includes('audio') && !contentType.includes('octet-stream')) {
          lastError = new Error(`Content-Type non audio: ${contentType}`);
          continue;
        }

        const arrBuf = await response.arrayBuffer();
        if (!arrBuf || arrBuf.byteLength < 128) {
          lastError = new Error('Flusso audio ricevuto vuoto o troncato.');
          continue;
        }

        rawBase64 = Buffer.from(arrBuf).toString('base64');
        setTtsCache(rawCacheKey, rawBase64);
        break;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!rawBase64) {
      console.warn('Google TTS non disponibile, uso sintetizzatore locale Flite:', lastError?.message);
      rawBase64 = await synthesizeFliteMp3Fallback(cleanChunk);
      setTtsCache(rawCacheKey, rawBase64);
    }
  }

  const finalBase64 = await applyVocalShapingMp3(rawBase64, pitch, rate);
  setTtsCache(shapedCacheKey, finalBase64);
  return finalBase64;
}

// Zero-config, zero-token Google Studio TTS audio endpoint (with multi-endpoint fallback + FFmpeg vocal shaping + local Flite backup)
app.post('/api/free-tts', async (req, res) => {
  try {
    const { text, lang = 'it-IT', pitch = 1.0, rate = 1.0 } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Testo mancante per la sintesi vocale.' });
    }

    const tl = mapToGoogleTtsLang(lang);
    const numPitch = typeof pitch === 'number' && Number.isFinite(pitch) ? pitch : 1.0;
    const numRate = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1.0;
    const textChunks = splitTextForTtsChunks(sanitizeTextForTts(text), 170).filter(hasSpeakableContent);
    if (textChunks.length === 0) {
      return res.status(400).json({ error: 'Copione vuoto.' });
    }

    const audioChunks: string[] = [];
    for (let i = 0; i < textChunks.length; i += 2) {
      const batch = textChunks.slice(i, i + 2);
      const batchResults = await Promise.all(
        batch.map((chunk) => fetchTtsChunkWithFallback(chunk, tl, numPitch, numRate))
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
    const base64MarkerIdx = videoBase64.indexOf(';base64,');
    const cleanVideoBase64 =
      base64MarkerIdx >= 0 ? videoBase64.slice(base64MarkerIdx + 8) : videoBase64;
    const videoBuffer = Buffer.from(cleanVideoBase64, 'base64');

    const isEbmlWebm =
      videoBuffer.length >= 4 &&
      videoBuffer[0] === 0x1a &&
      videoBuffer[1] === 0x45 &&
      videoBuffer[2] === 0xdf &&
      videoBuffer[3] === 0xa3;
    const isIsoMp4 =
      videoBuffer.length >= 8 &&
      videoBuffer.subarray(4, 8).toString('ascii') === 'ftyp';

    const safeExt = isIsoMp4 ? 'mp4' : isEbmlWebm ? 'webm' : videoFormat === 'mp4' ? 'mp4' : 'webm';
    const inputVideoPath = path.join(tmpDir, `input.${safeExt}`);
    const outputMp4Path = path.join(tmpDir, 'output.mp4');

    await fs.promises.writeFile(inputVideoPath, videoBuffer);

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
