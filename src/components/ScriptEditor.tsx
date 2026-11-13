import React, { useEffect, useState } from 'react';
import { BroadcastState, LanguageOption } from '../types';
import { LANGUAGES } from '../constants/languages';
import {
  SystemVoiceItem,
  getAllSystemVoices,
  resolveSystemVoice,
} from '../utils/speechVoices';
import {
  Globe,
  Mic,
  Volume2,
  Play,
  Square,
  Loader2,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';

interface ScriptEditorProps {
  state: BroadcastState;
  onChange: (patch: Partial<BroadcastState>) => void;
  isPlaying: boolean;
  onPlaySpeech: () => void;
  onStopSpeech: () => void;
  isLoadingVoice: boolean;
  currentLanguage: LanguageOption;
  onSelectLanguage: (lang: LanguageOption) => void;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  state,
  onChange,
  isPlaying,
  onPlaySpeech,
  onStopSpeech,
  isLoadingVoice,
  currentLanguage,
  onSelectLanguage,
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [voices, setVoices] = useState<SystemVoiceItem[]>([]);
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  const loadVoices = () => {
    const list = getAllSystemVoices();
    setVoices(list);
    return list;
  };

  useEffect(() => {
    loadVoices();

    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const handleVoicesChanged = () => {
      loadVoices();
    };

    window.speechSynthesis.addEventListener?.('voiceschanged', handleVoicesChanged);
    window.addEventListener('focus', handleVoicesChanged);

    let attempts = 0;
    const poll = window.setInterval(() => {
      attempts += 1;
      const loaded = loadVoices();
      if ((loaded.length > 0 && attempts >= 4) || attempts >= 16) {
        window.clearInterval(poll);
      }
    }, 300);

    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', handleVoicesChanged);
      window.removeEventListener('focus', handleVoicesChanged);
      window.clearInterval(poll);
    };
  }, []);

  const handleTestVoice = () => {
    const sampleLine =
      state.scriptText.trim().split(/[.!?]/)[0]?.trim() ||
      currentLanguage.sampleScript.split(/[.!?]/)[0]?.trim() ||
      'Buonasera e benvenuti al telegiornale.';

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setStatusMessage('Sintesi vocale Web Speech non disponibile su questo browser.');
      return;
    }

    const wasSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    window.speechSynthesis.cancel();

    const startTest = () => {
      const utterance = new SpeechSynthesisUtterance(sampleLine.slice(0, 140));
      const chosen = resolveSystemVoice(state.selectedVoiceURI, currentLanguage.webSpeechLang);

      if (chosen) {
        utterance.voice = chosen;
        utterance.lang = chosen.lang || currentLanguage.webSpeechLang;
      } else {
        utterance.lang = currentLanguage.webSpeechLang;
      }

      utterance.pitch = state.voicePitch ?? 1.0;
      utterance.rate = state.voiceRate ?? 1.0;

      setIsTestingVoice(true);
      utterance.onend = () => setIsTestingVoice(false);
      utterance.onerror = () => setIsTestingVoice(false);
      window.speechSynthesis.speak(utterance);
    };

    if (wasSpeaking) {
      window.setTimeout(startTest, 80);
    } else {
      startTest();
    }
  };

  const autoMatchedVoice = resolveSystemVoice('', currentLanguage.webSpeechLang);
  const googleVoicesCount = voices.filter((v) => v.isGoogle).length;

  // Approximate reading duration
  const wordCount = state.scriptText.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.max(1, Math.round((wordCount / 130) * 60));

  // Language groups
  const westernLangs = LANGUAGES.filter((l) => l.group === 'western');
  const easternLangs = LANGUAGES.filter((l) => l.group === 'eastern');
  const slavicLangs = LANGUAGES.filter((l) => l.group === 'slavic');

  return (
    <div className="space-y-5">
      {/* 1. LANGUAGE & ALL DEVICE / GOOGLE / ANDROID VOICES (NO FILTERS, NO ARTIFICIAL EFFECTS) */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <Globe className="w-4 h-4 text-sky-400" />
            <span>Lingua Copione & Voci Google / Android</span>
          </div>
          <span className="text-xs text-slate-400 font-data">
            {currentLanguage.flag} {currentLanguage.nativeName}
          </span>
        </div>

        {/* Language Tabs grouped by Family */}
        <div className="space-y-2">
          {/* Western Languages */}
          <div>
            <div className="text-[11px] font-medium text-slate-400 mb-1.5">
              Occidentali:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {westernLangs.map((lang) => {
                const active = state.selectedLanguage === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => onSelectLanguage(lang)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      active
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Eastern Languages */}
          <div>
            <div className="text-[11px] font-medium text-slate-400 mb-1.5">
              Orientali & Asiatiche:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {easternLangs.map((lang) => {
                const active = state.selectedLanguage === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => onSelectLanguage(lang)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      active
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.nativeName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slavic Languages */}
          <div>
            <div className="text-[11px] font-medium text-slate-400 mb-1.5">
              Slave:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {slavicLangs.map((lang) => {
                const active = state.selectedLanguage === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => onSelectLanguage(lang)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      active
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.nativeName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pure Browser Google Voice Selector (Zero Server Dependency) */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">
                Voci Google & Dispositivo ({voices.length} totali{googleVoicesCount > 0 ? ` · ${googleVoicesCount} Google` : ''})
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                const refreshed = loadVoices();
                setStatusMessage(`Rilevate ${refreshed.length} voci dirette dal browser/dispositivo.`);
                setTimeout(() => setStatusMessage(null), 2500);
              }}
              className="px-2.5 py-1 text-[11px] text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
              title="Aggiorna elenco voci dal dispositivo"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Aggiorna</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={state.selectedVoiceURI}
              onChange={(e) => onChange({ selectedVoiceURI: e.target.value })}
              className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">
                Automatica Google ({autoMatchedVoice ? `${autoMatchedVoice.name} · ${autoMatchedVoice.lang}` : currentLanguage.webSpeechLang})
              </option>
              {voices.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.isGoogle ? `★ ${v.name}` : v.name} ({v.lang})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleTestVoice}
              disabled={isTestingVoice}
              className="px-3 py-2 text-xs font-semibold text-sky-300 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-700/60 rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
            >
              {isTestingVoice ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span>{isTestingVoice ? 'In prova...' : 'Testa Voce'}</span>
            </button>
          </div>

          {/* Pitch & Rate Sliders for Voice Variation */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Timbro / Tono</span>
                <span className="font-data text-slate-200">{(state.voicePitch ?? 1.0).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.75"
                max="1.30"
                step="0.05"
                value={state.voicePitch ?? 1.0}
                onChange={(e) => onChange({ voicePitch: parseFloat(e.target.value) })}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Velocità Lettura</span>
                <span className="font-data text-slate-200">{(state.voiceRate ?? 1.0).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.80"
                max="1.25"
                step="0.05"
                value={state.voiceRate ?? 1.0}
                onChange={(e) => onChange({ voiceRate: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Sintesi diretta tramite il servizio voci Google del browser (senza server né blocchi). Seleziona qualsiasi voce sopra o regola il timbro per differenziare ogni conduttore.
          </p>
        </div>
      </div>

      {/* 2. TELEPROMPTER SCRIPT */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">Copione Teleprompter (Discorso Notiziario)</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 font-data">
            <span>{wordCount} parole</span>
            <span>·</span>
            <span>~{estimatedSeconds}s stimate</span>
          </div>
        </div>

        <textarea
          value={state.scriptText}
          onChange={(e) => onChange({ scriptText: e.target.value })}
          rows={4}
          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 leading-relaxed font-sans"
          placeholder="Inserisci il discorso che il conduttore leggerà nel notiziario..."
        />

        {/* Action Shortcuts */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onChange({
                scriptText: currentLanguage.sampleScript,
                lowerThird: {
                  ...state.lowerThird,
                  headline: currentLanguage.sampleHeadline,
                },
                ticker: {
                  ...state.ticker,
                  text: currentLanguage.sampleTicker,
                },
              });
              setStatusMessage(`Copione, titolo e ticker impostati in ${currentLanguage.name}.`);
              setTimeout(() => setStatusMessage(null), 2500);
            }}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Ripristina il copione di esempio per questa lingua"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Testo di Esempio ({currentLanguage.name})</span>
          </button>

          {/* Quick Play & Stop Test */}
          <div className="flex items-center gap-2">
            {isPlaying ? (
              <button
                type="button"
                onClick={onStopSpeech}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-rose-900/30 whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Interrompi Lettura</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPlaySpeech}
                disabled={isLoadingVoice || !state.scriptText.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-900/30 whitespace-nowrap disabled:opacity-50"
              >
                {isLoadingVoice ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>{isLoadingVoice ? 'Avvio voce...' : 'Ascolta & Sincronizza'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div className="text-xs text-sky-400 bg-sky-950/40 border border-sky-800/60 px-3 py-2 rounded-lg font-medium">
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};
