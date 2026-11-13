// Zero-dependency Vercel Serverless Function fallback for Google TTS audio.
// Used automatically if the project is deployed to Vercel without Express server.ts.

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

function sanitizeTextForTts(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchGoogleTtsChunk(chunkText: string, tl: string): Promise<string> {
  const encoded = encodeURIComponent(chunkText);
  const endpoints = [
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${encodeURIComponent(tl)}&client=gtx`,
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${encodeURIComponent(tl)}&client=dict-chrome-ex`,
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${encodeURIComponent(tl)}&client=tw-ob`,
  ];

  let lastErr = 'Google TTS non raggiungibile';
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(4000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        },
      });
      if (!resp.ok) {
        lastErr = `HTTP ${resp.status}`;
        continue;
      }
      const arrBuf = await resp.arrayBuffer();
      if (!arrBuf || arrBuf.byteLength < 128) {
        lastErr = 'Audio vuoto';
        continue;
      }
      return Buffer.from(arrBuf).toString('base64');
    } catch (e: any) {
      lastErr = e?.message || 'Errore rete';
    }
  }
  throw new Error(lastErr);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { text, lang = 'it-IT' } = body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Testo mancante per la sintesi vocale.' });
    }

    const tl = mapToGoogleTtsLang(lang);
    const chunksText = splitTextForTtsChunks(sanitizeTextForTts(text), 170).filter((c) =>
      /[\p{L}\p{N}]/u.test(c)
    );
    if (chunksText.length === 0) {
      return res.status(400).json({ error: 'Copione vuoto.' });
    }

    const audioChunks: string[] = [];
    for (let i = 0; i < chunksText.length; i += 4) {
      const batch = chunksText.slice(i, i + 4);
      const resBatch = await Promise.all(batch.map((c) => fetchGoogleTtsChunk(c, tl)));
      audioChunks.push(...resBatch);
    }

    return res.status(200).json({
      audioId: '',
      chunks: audioChunks,
      mimeType: 'audio/mpeg',
      lang: tl,
    });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Errore generazione audio Google.' });
  }
}
