import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  BroadcastState,
  AnchorProfile,
  StudioBackground,
  VisemeMetrics,
  LanguageOption,
} from './types';
import { LANGUAGES } from './constants/languages';
import { ANCHOR_PROFILES } from './constants/anchors';
import { STUDIO_BACKGROUNDS, STUDIO_IMAGE_ASSETS } from './constants/backgrounds';
import { globalAudioEngine } from './utils/audioAnalyzer';
import { globalVideoRecorder, RecordingResult } from './utils/videoRecorder';
import { resolveSystemVoice, splitTextIntoSpeechChunks } from './utils/speechVoices';
import { BroadcastCanvas } from './components/BroadcastCanvas';
import { TopBar, ActiveStudioTab } from './components/TopBar';
import { ScriptEditor } from './components/ScriptEditor';
import { AnchorSelector } from './components/AnchorSelector';
import { MediaControls } from './components/MediaControls';
import { GraphicsEditor } from './components/GraphicsEditor';
import { VideoExportModal } from './components/VideoExportModal';
import {
  Play,
  Square,
  Video,
  AlertCircle,
  Film,
} from 'lucide-react';

export default function App() {
  const initialLang = LANGUAGES[0]; // Italiano

  const [state, setState] = useState<BroadcastState>({
    currentAnchorId: ANCHOR_PROFILES[0].id,
    currentBgId: STUDIO_BACKGROUNDS[0].id,
    customBgUrl: null,
    selectedLanguage: initialLang.code,
    scriptText: initialLang.sampleScript,
    selectedVoice: 'Kore',
    selectedVoiceURI: '',
    voiceStyle: 'Clear, authoritative TV news anchor with crisp articulation and television cadence',
    speechEngine: 'browser',
    pip: {
      enabled: true,
      imageUrl: STUDIO_IMAGE_ASSETS.global,
      topicTag: 'PRIMO PIANO',
      position: 'top-right',
    },
    lowerThird: {
      enabled: true,
      category: "ULTIM'ORA",
      headline: initialLang.sampleHeadline,
      subheadline: 'ROMA · EDIZIONE CENTRALE ORE 20:00 · DIRETTA STREAMING',
      anchorName: ANCHOR_PROFILES[0].name,
      anchorTitle: ANCHOR_PROFILES[0].role,
      showLiveBadge: true,
      style: 'breaking',
    },
    ticker: {
      enabled: true,
      speed: 26,
      text: initialLang.sampleTicker,
      label: 'TG 24 LIVE',
      bgStyle: 'black',
      fontSize: 'gigantic',
    },
    watermark: {
      enabled: true,
      text: 'TG 24 HD',
      subtext: '● DIRETTA',
      position: 'top-right',
    },
    deskOverlay: true,
    cameraZoom: 'normal',
    avatarScale: 2.3,
    avatarPositionY: 0,
    avatarPositionX: 0,
    endCredits: {
      enabled: true,
      edition: 'Edizione Straordinaria TG Studio',
      director: 'Regia & Coordinamento TG',
      production: 'Redazione Giornalistica HD',
      audioTech: 'Voci Google / Android & Lip-Sync Studio',
      customNotes: 'Grazie per aver seguito la nostra edizione',
      durationSec: 4.5,
    },
    showCreditsNow: false,
  });

  const [activeTab, setActiveTab] = useState<ActiveStudioTab>('direct');
  const [customAnchor, setCustomAnchor] = useState<AnchorProfile | null>(null);

  // Lip sync metrics from audio engine
  const [visemeMetrics, setVisemeMetrics] = useState<VisemeMetrics>({
    openness: 0,
    width: 0.5,
    teeth: 0,
    volume: 0,
    isSpeaking: false,
  });

  // Playback & Voice state
  const [isPlayingSpeech, setIsPlayingSpeech] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [testMouthOpen, setTestMouthOpen] = useState(false);

  // Video Recording state & synchronization refs
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingResult, setRecordingResult] = useState<RecordingResult | null>(null);
  const [isFinalizingCredits, setIsFinalizingCredits] = useState(false);

  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const isRecordingRef = useRef(false);
  const stateRef = useRef(state);
  const isFinalizingRef = useRef(false);
  const speechSessionRef = useRef(0);
  const speechKeepAliveRef = useRef<number | null>(null);

  // Keep refs synchronized on every render to eliminate stale closures
  stateRef.current = state;
  isRecordingRef.current = isRecording;

  // Resolve current anchor and background
  const currentAnchor =
    state.currentAnchorId === customAnchor?.id && customAnchor
      ? customAnchor
      : ANCHOR_PROFILES.find((a) => a.id === state.currentAnchorId) || ANCHOR_PROFILES[0];

  const currentBg =
    STUDIO_BACKGROUNDS.find((b) => b.id === state.currentBgId) || STUDIO_BACKGROUNDS[0];

  const currentLanguage =
    LANGUAGES.find((l) => l.code === state.selectedLanguage) || LANGUAGES[0];

  const lastMetricUpdateRef = useRef(0);
  const wasSpeakingMetricRef = useRef(false);
  const handleAudioMetrics = useCallback((metrics: VisemeMetrics) => {
    const now = performance.now();
    // Throttle React state re-renders to ~8fps (120ms) for UI meters without stalling the main thread.
    // The canvas pulls viseme metrics directly from globalAudioEngine.
    if (!metrics.isSpeaking && !wasSpeakingMetricRef.current) {
      return;
    }
    if (now - lastMetricUpdateRef.current > 120 || !metrics.isSpeaking) {
      lastMetricUpdateRef.current = now;
      wasSpeakingMetricRef.current = metrics.isSpeaking;
      setVisemeMetrics(metrics);
    }
  }, []);

  const handleCanvasRef = useCallback((c: HTMLCanvasElement | null) => {
    canvasElementRef.current = c;
  }, []);

  const updateState = useCallback((patch: Partial<BroadcastState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSelectLanguage = (lang: LanguageOption) => {
    setState((prev) => ({
      ...prev,
      selectedLanguage: lang.code,
      scriptText: lang.sampleScript,
      selectedVoice: lang.defaultVoice as any,
      selectedVoiceURI: '', // Auto-pick best Google / Android voice for new language
      lowerThird: {
        ...prev.lowerThird,
        headline: lang.sampleHeadline,
      },
      ticker: {
        ...prev.ticker,
        text: lang.sampleTicker,
      },
    }));
  };

  const clearSpeechKeepAlive = () => {
    if (speechKeepAliveRef.current !== null) {
      window.clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }
  };

  const handleStopSpeech = () => {
    speechSessionRef.current += 1;
    clearSpeechKeepAlive();
    globalAudioEngine.stop();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingSpeech(false);
  };

  useEffect(() => {
    return () => {
      speechSessionRef.current += 1;
      clearSpeechKeepAlive();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Seamlessly roll End Credits on canvas before finalizing video recording
  const finishRecordingWithCredits = useCallback(async () => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;
    setIsFinalizingCredits(true);

    handleStopSpeech();

    const currentCredits = stateRef.current.endCredits;
    if (currentCredits.enabled) {
      // Roll full-screen broadcast End Credits slate on canvas while video recorder is capturing
      setState((prev) => ({ ...prev, showCreditsNow: true }));
      const waitMs = Math.max(2500, (currentCredits.durationSec || 4.5) * 1000);
      await new Promise((r) => setTimeout(r, waitMs));
      setState((prev) => ({ ...prev, showCreditsNow: false }));
    }

    try {
      const result = await globalVideoRecorder.stopRecording();
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSeconds(0);
      setRecordingResult(result);
    } catch (err: any) {
      console.error('Errore finalizzazione video:', err);
      setVoiceNotice(err?.message || 'Errore durante il salvataggio del video registrato.');
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSeconds(0);
    } finally {
      setIsFinalizingCredits(false);
      isFinalizingRef.current = false;
    }
  }, []);

  // Play Speech: uses recordable native Google Studio Audio by default (or chosen browser voice when selected)
  const handlePlaySpeech = async () => {
    const text = stateRef.current.scriptText.trim();
    if (!text) return;

    setVoiceNotice(null);
    globalAudioEngine.unlockAudio();

    // If user explicitly selected a browser/device Web Speech voice, play it directly without modifications
    if (stateRef.current.selectedVoiceURI) {
      playWebSpeech();
      return;
    }

    const sessionId = ++speechSessionRef.current;
    setIsLoadingVoice(true);

    try {
      const res = await fetch('/api/free-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          lang: currentLanguage.webSpeechLang,
        }),
      });

      if (speechSessionRef.current !== sessionId) return;

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.chunks || !Array.isArray(data.chunks) || data.chunks.length === 0) {
        throw new Error('Audio non ricevuto');
      }

      if (speechSessionRef.current !== sessionId) return;

      setIsPlayingSpeech(true);
      setIsLoadingVoice(false);

      await globalAudioEngine.playAudioChunksBase64(
        data.chunks,
        handleAudioMetrics,
        () => {
          if (speechSessionRef.current !== sessionId) return;
          setIsPlayingSpeech(false);
          if (isRecordingRef.current || globalVideoRecorder.getIsRecording()) {
            void finishRecordingWithCredits();
          }
        }
      );
    } catch (err) {
      console.warn('Fallback a Web Speech locale:', err);
      if (speechSessionRef.current === sessionId) {
        setIsLoadingVoice(false);
        playWebSpeech();
      }
    } finally {
      setIsLoadingVoice(false);
    }
  };

  // Chunked Web Speech player for reliable Google / Android playback of any script length
  const playWebSpeech = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setVoiceNotice('Sintesi vocale Web Speech non disponibile su questo browser.');
      return;
    }

    const sessionId = ++speechSessionRef.current;
    clearSpeechKeepAlive();

    const wasBusy = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    if (wasBusy) {
      window.speechSynthesis.cancel();
    }

    const chunks = splitTextIntoSpeechChunks(state.scriptText);
    if (chunks.length === 0) return;

    // Generous max duration for lip-sync simulation; stopped explicitly when final chunk ends
    const words = state.scriptText.trim().split(/\s+/).length;
    const estSec = Math.max(4, (words / 110) * 60) + 15;

    setIsPlayingSpeech(true);
    globalAudioEngine.startSpeechSimulation(
      estSec,
      handleAudioMetrics
    );

    let chunkIndex = 0;

    const finishAllChunks = async () => {
      if (speechSessionRef.current !== sessionId) return;
      clearSpeechKeepAlive();
      setIsPlayingSpeech(false);
      globalAudioEngine.stop();
      if (isRecordingRef.current || globalVideoRecorder.getIsRecording()) {
        await finishRecordingWithCredits();
      }
    };

    const speakNextChunk = () => {
      if (speechSessionRef.current !== sessionId) return;
      if (chunkIndex >= chunks.length) {
        void finishAllChunks();
        return;
      }

      // Resolve fresh on first/each chunk in case voices loaded asynchronously
      const chosenVoice = resolveSystemVoice(
        stateRef.current.selectedVoiceURI,
        currentLanguage.webSpeechLang
      );

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang || currentLanguage.webSpeechLang;
      } else {
        // Let the OS / Android TTS engine pick the native voice for target language (e.g. it-IT)
        utterance.lang = currentLanguage.webSpeechLang;
      }

      utterance.onend = () => {
        if (speechSessionRef.current !== sessionId) return;
        chunkIndex += 1;
        if (chunkIndex < chunks.length) {
          speakNextChunk();
        } else {
          void finishAllChunks();
        }
      };

      utterance.onerror = (ev) => {
        if (speechSessionRef.current !== sessionId) return;
        if (ev.error === 'interrupted' || ev.error === 'canceled') return;
        console.warn('Errore chunk Web Speech:', ev.error);
        chunkIndex += 1;
        if (chunkIndex < chunks.length) {
          speakNextChunk();
        } else {
          void finishAllChunks();
        }
      };

      window.speechSynthesis.speak(utterance);
    };

    // Avoid Chromium race where synchronous cancel() cancels a newly queued utterance
    if (wasBusy) {
      window.setTimeout(() => {
        if (speechSessionRef.current === sessionId) {
          speakNextChunk();
        }
      }, 80);
    } else {
      speakNextChunk();
    }
  };

  // Toggle Video Recording
  const handleToggleRecord = async () => {
    if (isRecording || isFinalizingCredits) {
      // Stop recording and capture end credits slate
      await finishRecordingWithCredits();
    } else {
      // Start recording
      const canvas = canvasElementRef.current;
      if (!canvas) return;
      if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
        setVoiceNotice('La registrazione video diretta dal browser non è supportata su questo dispositivo.');
        return;
      }

      updateState({ showCreditsNow: false });
      const audioStream = globalAudioEngine.getAudioStream();
      const started = globalVideoRecorder.startRecording(canvas, audioStream, (secs) => {
        setRecordingSeconds(secs);
      });

      if (started) {
        setVoiceNotice(null);
        setTestMouthOpen(false);
        isRecordingRef.current = true;
        setIsRecording(true);
        // Automatically start speech for video broadcast
        handlePlaySpeech();
      } else {
        setVoiceNotice('Impossibile avviare la registrazione video su questo browser.');
      }
    }
  };

  const handleSnapshot = (dataUrl: string) => {
    const link = document.createElement('a');
    link.download = `TG_Studio_Frame_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col font-sans">
      {/* Top Bar Contract */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isRecording={isRecording}
        recordingSeconds={recordingSeconds}
        onToggleRecord={handleToggleRecord}
        isFinalizing={isFinalizingCredits}
      />

      {/* Main Studio Workspace */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Live Broadcast Viewport (7 Cols on XL) */}
        <div className="xl:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Monitor Regia Broadcast (1080p 60FPS)
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-data">
              <span>{currentAnchor.name}</span>
              <span>·</span>
              <span>{currentLanguage.flag} {currentLanguage.name}</span>
            </div>
          </div>

          {/* Banner during credits recording */}
          {isFinalizingCredits && (
            <div className="flex items-center gap-2.5 p-3 bg-amber-950/90 border border-amber-500/70 rounded-xl text-xs text-amber-200 shadow-xl animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span className="font-bold uppercase tracking-wide">Registrazione Titoli di Coda:</span>
              <span className="text-amber-200/90">La schermata finale con i crediti è in acquisizione nel file video. Il download apparirà tra pochi secondi...</span>
            </div>
          )}

          {/* 16:9 Canvas Viewport */}
          <BroadcastCanvas
            state={state}
            currentAnchor={currentAnchor}
            currentBg={currentBg}
            visemeMetrics={
              testMouthOpen && !isPlayingSpeech && !isRecording
                ? { openness: 0.72, width: 0.65, teeth: 0.55, volume: 0.75, isSpeaking: true }
                : visemeMetrics
            }
            isRecording={isRecording}
            recordingSeconds={recordingSeconds}
            onSnapshot={handleSnapshot}
            canvasRefCallback={handleCanvasRef}
          />

          {/* Quick Studio Bar below Viewport */}
          <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              {isPlayingSpeech ? (
                <button
                  onClick={handleStopSpeech}
                  className="px-3.5 py-1.5 font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Interrompi</span>
                </button>
              ) : (
                <button
                  onClick={handlePlaySpeech}
                  disabled={isLoadingVoice || isFinalizingCredits}
                  className="px-3.5 py-1.5 font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isLoadingVoice ? 'Caricamento Voce...' : 'Ascolta Notiziario'}</span>
                </button>
              )}

              <button
                onClick={handleToggleRecord}
                disabled={isFinalizingCredits}
                className={`px-3.5 py-1.5 font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm ${
                  isFinalizingCredits
                    ? 'bg-amber-600 text-white animate-pulse'
                    : isRecording
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>
                  {isFinalizingCredits
                    ? 'Titoli di Coda in Corso...'
                    : isRecording
                    ? 'Termina Registrazione'
                    : 'Registra Notiziario'}
                </span>
              </button>
            </div>

            {/* Quick Inquadratura Framing */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-500 font-medium px-1">Inquadratura:</span>
              <button
                onClick={() => updateState({ cameraZoom: 'close', avatarScale: 2.8, avatarPositionY: -20 })}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  state.cameraZoom === 'close'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Primo piano TV grande e visibile"
              >
                Primo Piano TV
              </button>
              <button
                onClick={() => updateState({ cameraZoom: 'normal', avatarScale: 2.3, avatarPositionY: 0 })}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  state.cameraZoom === 'normal'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Mezzo busto classico TG"
              >
                Mezzo Busto
              </button>
              <button
                onClick={() => updateState({ cameraZoom: 'extreme-close', avatarScale: 3.2, avatarPositionY: -40 })}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  state.cameraZoom === 'extreme-close'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Primissimo piano maxi"
              >
                Maxi Focus
              </button>
            </div>

            {/* Quick Titoli di Coda Toggle */}
            <button
              onClick={() => updateState({ showCreditsNow: !state.showCreditsNow })}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                state.showCreditsNow
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title="Mostra / Nascondi l'anteprima dei Titoli di Coda sul monitor di trasmissione"
            >
              <Film className="w-3.5 h-3.5" />
              <span>{state.showCreditsNow ? 'Chiudi Titoli' : 'Titoli di Coda'}</span>
            </button>

            {/* Audio Waveform / Lip-Sync Energy Telemetry */}
            <div className="flex items-center gap-2 font-data text-slate-400">
              <span className="text-slate-400">Energia Vocale:</span>
              <div className="w-20 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 via-emerald-400 to-rose-500 transition-all duration-75"
                  style={{ width: `${Math.round(visemeMetrics.volume * 100)}%` }}
                />
              </div>
              <span className="w-8 text-right">{Math.round(visemeMetrics.volume * 100)}%</span>
            </div>
          </div>

          {voiceNotice && (
            <div className="flex items-center gap-2 p-3 bg-slate-900/80 border border-amber-600/40 rounded-xl text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{voiceNotice}</span>
            </div>
          )}
        </div>

        {/* Right Column: Studio Controls Panel (5 Cols on XL) */}
        <div className="xl:col-span-5 space-y-4">
          {/* Segmented Control Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab('direct')}
              className={`flex-1 min-w-[70px] py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center ${
                activeTab === 'direct'
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Panoramica
            </button>
            <button
              onClick={() => setActiveTab('script')}
              className={`flex-1 min-w-[70px] py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center ${
                activeTab === 'script'
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Copione & Voce
            </button>
            <button
              onClick={() => setActiveTab('avatar')}
              className={`flex-1 min-w-[70px] py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center ${
                activeTab === 'avatar'
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Avatar & Foto
            </button>
            <button
              onClick={() => setActiveTab('media')}
              className={`flex-1 min-w-[70px] py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center ${
                activeTab === 'media'
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sfondi & Media
            </button>
            <button
              onClick={() => setActiveTab('graphics')}
              className={`flex-1 min-w-[70px] py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center ${
                activeTab === 'graphics'
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Grafiche TV
            </button>
          </div>

          {/* Active Tab Content */}
          {activeTab === 'direct' && (
            <div className="space-y-4">
              <ScriptEditor
                state={state}
                onChange={updateState}
                isPlaying={isPlayingSpeech}
                onPlaySpeech={handlePlaySpeech}
                onStopSpeech={handleStopSpeech}
                isLoadingVoice={isLoadingVoice}
                currentLanguage={currentLanguage}
                onSelectLanguage={handleSelectLanguage}
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setActiveTab('media')}
                  className="p-3 bg-slate-900/80 hover:bg-slate-900 rounded-xl border border-slate-800 text-left transition-colors"
                >
                  <div className="text-xs font-semibold text-sky-400 mb-1">Sfondo Attivo</div>
                  <div className="text-xs text-slate-200 truncate">{state.customBgUrl ? 'Sfondo Personalizzato' : currentBg.name}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Clicca per cambiare o caricare foto</div>
                </button>
                <button
                  onClick={() => setActiveTab('avatar')}
                  className="p-3 bg-slate-900/80 hover:bg-slate-900 rounded-xl border border-slate-800 text-left transition-colors"
                >
                  <div className="text-xs font-semibold text-amber-400 mb-1">Conduttore Attivo</div>
                  <div className="text-xs text-slate-200 truncate">{currentAnchor.name}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Cambia anchor o carica la tua foto</div>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'script' && (
            <ScriptEditor
              state={state}
              onChange={updateState}
              isPlaying={isPlayingSpeech}
              onPlaySpeech={handlePlaySpeech}
              onStopSpeech={handleStopSpeech}
              isLoadingVoice={isLoadingVoice}
              currentLanguage={currentLanguage}
              onSelectLanguage={handleSelectLanguage}
            />
          )}

          {activeTab === 'avatar' && (
            <AnchorSelector
              state={state}
              onChange={updateState}
              currentAnchor={currentAnchor}
              customAnchor={customAnchor}
              onUpdateCustomAnchor={setCustomAnchor}
              testMouthOpen={testMouthOpen}
              onToggleTestMouth={() => setTestMouthOpen((prev) => !prev)}
            />
          )}

          {activeTab === 'media' && (
            <MediaControls
              state={state}
              onChange={updateState}
              currentBg={currentBg}
            />
          )}

          {activeTab === 'graphics' && (
            <GraphicsEditor
              state={state}
              onChange={updateState}
            />
          )}
        </div>
      </main>

      {/* Video Export Modal */}
      <VideoExportModal
        result={recordingResult}
        onClose={() => setRecordingResult(null)}
      />
    </div>
  );
}
