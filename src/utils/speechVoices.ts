export interface SystemVoiceItem {
  key: string;
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
  voiceURI: string;
}

function normalizeLangTag(lang: string | undefined): string {
  return (lang || '').trim().replace(/_/g, '-').toLowerCase();
}

export function getAllSystemVoices(): SystemVoiceItem[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }

  const rawVoices = window.speechSynthesis.getVoices() || [];
  return rawVoices.map((voice, index) => ({
    key: `${voice.voiceURI || voice.name || 'voice'}::${voice.lang || ''}::${index}`,
    voice,
    name: voice.name || voice.voiceURI || `Voce ${index + 1}`,
    lang: voice.lang || '',
    voiceURI: voice.voiceURI || '',
  }));
}

export function resolveSystemVoice(
  selectedVoiceKey: string,
  targetWebSpeechLang: string
): SpeechSynthesisVoice | null {
  const all = getAllSystemVoices();
  if (all.length === 0) return null;

  if (selectedVoiceKey) {
    const exact = all.find(
      (item) =>
        item.key === selectedVoiceKey ||
        (item.voiceURI && item.voiceURI === selectedVoiceKey) ||
        (item.name && item.name === selectedVoiceKey)
    );
    if (exact) return exact.voice;

    // Also match if saved key came from an older format containing "::voiceURI::name::lang"
    const keyParts = selectedVoiceKey.split('::').filter(Boolean);
    if (keyParts.length >= 2) {
      const byParts = all.find(
        (item) =>
          (item.voiceURI && keyParts.includes(item.voiceURI)) ||
          (item.name && keyParts.includes(item.name))
      );
      if (byParts) return byParts.voice;
    }
  }

  const target = normalizeLangTag(targetWebSpeechLang);
  const base = target.split('-')[0];
  if (!base) return null;

  const iso3Map: Record<string, string> = {
    it: 'ita',
    en: 'eng',
    es: 'spa',
    fr: 'fra',
    de: 'deu',
    pt: 'por',
    ru: 'rus',
    pl: 'pol',
    uk: 'ukr',
    ja: 'jpn',
    zh: 'zho',
    ko: 'kor',
    ar: 'ara',
    hi: 'hin',
    tr: 'tur',
    cs: 'ces',
    bg: 'bul',
  };
  const iso3 = iso3Map[base] || '';

  const exactLangMatches = all.filter((item) => normalizeLangTag(item.lang) === target);
  if (exactLangMatches.length > 0) {
    const preferred =
      exactLangMatches.find((v) => /google/i.test(v.name)) ||
      exactLangMatches.find((v) => v.voice.localService) ||
      exactLangMatches.find((v) => v.voice.default) ||
      exactLangMatches[0];
    return preferred.voice;
  }

  const baseLangMatches = all.filter((item) => {
    const n = normalizeLangTag(item.lang);
    return (
      n === base ||
      n.startsWith(`${base}-`) ||
      (iso3 && (n === iso3 || n.startsWith(`${iso3}-`))) ||
      (base === 'it' && /italian|italiano/i.test(item.name))
    );
  });
  if (baseLangMatches.length > 0) {
    const preferred =
      baseLangMatches.find((v) => /google/i.test(v.name)) ||
      baseLangMatches.find((v) => v.voice.localService) ||
      baseLangMatches[0];
    return preferred.voice;
  }

  // NEVER fall back to all[0] (which is often en-US and gives Italian a foreign accent).
  // Returning null lets utterance.lang instruct the OS/browser to speak in the target language natively.
  return null;
}

/**
 * Splits long broadcast scripts into natural sentence chunks so Chrome/Android
 * Web Speech synthesis never silently freezes or cuts off after ~15 seconds.
 */
export function splitTextIntoSpeechChunks(text: string, maxLen = 140): string[] {
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
      const parts = sentence.split(/(?<=,|،|、)\s+/);
      let subBuf = '';
      for (const part of parts) {
        if ((subBuf + ' ' + part).trim().length <= maxLen) {
          subBuf = (subBuf + ' ' + part).trim();
        } else {
          if (subBuf) chunks.push(subBuf);
          if (part.length > maxLen) {
            const words = part.split(' ');
            let wordBuf = '';
            for (const w of words) {
              if ((wordBuf + ' ' + w).trim().length <= maxLen) {
                wordBuf = (wordBuf + ' ' + w).trim();
              } else {
                if (wordBuf) chunks.push(wordBuf);
                wordBuf = w;
              }
            }
            subBuf = wordBuf;
          } else {
            subBuf = part;
          }
        }
      }
      if (subBuf) chunks.push(subBuf);
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
