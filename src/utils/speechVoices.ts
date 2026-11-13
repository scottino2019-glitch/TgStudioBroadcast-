export interface SystemVoiceItem {
  key: string;
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
  voiceURI: string;
}

export function getAllSystemVoices(): SystemVoiceItem[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }

  const rawVoices = window.speechSynthesis.getVoices() || [];
  return rawVoices.map((voice, index) => ({
    key: `${index}::${voice.voiceURI || ''}::${voice.name || ''}::${voice.lang || ''}`,
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
        item.voiceURI === selectedVoiceKey ||
        item.name === selectedVoiceKey
    );
    if (exact) return exact.voice;
  }

  const target = (targetWebSpeechLang || '').replace(/_/g, '-').toLowerCase();
  const base = target.split('-')[0];

  const exactLang = all.find((item) => item.lang.replace(/_/g, '-').toLowerCase() === target);
  if (exactLang) return exactLang.voice;

  const baseLang = all.find((item) => item.lang.replace(/_/g, '-').toLowerCase().startsWith(base));
  if (baseLang) return baseLang.voice;

  return all[0].voice;
}

/**
 * Splits long broadcast scripts into natural sentence chunks so Chrome/Android
 * Web Speech synthesis never silently freezes or cuts off after ~15 seconds.
 */
export function splitTextIntoSpeechChunks(text: string, maxLen = 175): string[] {
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
