import React, { useRef, useState } from 'react';
import { BroadcastState, StudioBackground } from '../types';
import { STUDIO_BACKGROUNDS } from '../constants/backgrounds';
import { Upload, Image as ImageIcon, Sliders, Eye, Layout, Check, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { optimizeUploadedImage } from '../utils/imageOptimizer';

interface MediaControlsProps {
  state: BroadcastState;
  onChange: (patch: Partial<BroadcastState>) => void;
  currentBg: StudioBackground;
}

export const MediaControls: React.FC<MediaControlsProps> = ({
  state,
  onChange,
  currentBg,
}) => {
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const pipFileInputRef = useRef<HTMLInputElement | null>(null);

  const [isOptimizingBg, setIsOptimizingBg] = useState(false);
  const [isOptimizingPip, setIsOptimizingPip] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pipUploadError, setPipUploadError] = useState<string | null>(null);

  // Handle User Upload for Studio Background with automatic resize & optimization
  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOptimizingBg(true);
    setUploadError(null);

    // Yield to browser UI thread to show spinner immediately without freeze
    await new Promise((r) => setTimeout(r, 25));

    try {
      // Downscale to 1280x720 for instant processing and smooth 60fps render
      const optimizedUrl = await optimizeUploadedImage(file, {
        maxWidth: 1280,
        maxHeight: 720,
        quality: 0.82,
      });

      onChange({
        customBgUrl: optimizedUrl,
      });
    } catch (err: any) {
      console.error('Errore ottimizzazione sfondo:', err);
      setUploadError(err.message || 'Impossibile elaborare l\'immagine di sfondo.');
    } finally {
      setIsOptimizingBg(false);
      if (bgFileInputRef.current) bgFileInputRef.current.value = '';
    }
  };

  // Handle User Upload for Picture-in-Picture graphic with automatic optimization
  const handlePipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOptimizingPip(true);
    setPipUploadError(null);

    // Yield to browser UI thread to show spinner immediately without freeze
    await new Promise((r) => setTimeout(r, 25));

    try {
      // Downscale PiP graphic to crisp 640x360 (matching 16:9 broadcast box)
      const optimizedUrl = await optimizeUploadedImage(file, {
        maxWidth: 640,
        maxHeight: 360,
        quality: 0.82,
      });

      // Pre-warm image in browser cache so rendering is instant
      const prewarm = new Image();
      prewarm.src = optimizedUrl;
      if (typeof prewarm.decode === 'function') {
        prewarm.decode().catch(() => {});
      }

      onChange({
        pip: {
          ...state.pip,
          enabled: true,
          imageUrl: optimizedUrl,
        },
      });
    } catch (err: any) {
      console.error('Errore ottimizzazione foto PiP:', err);
      setPipUploadError(err.message || 'Impossibile elaborare l\'immagine della notizia.');
    } finally {
      setIsOptimizingPip(false);
      if (pipFileInputRef.current) pipFileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. STUDIO BACKGROUNDS & USER BACKDROP UPLOAD */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <ImageIcon className="w-4 h-4 text-sky-400" />
            <span>Sfondi & Ambientazioni Studio</span>
          </div>
          <button
            onClick={() => bgFileInputRef.current?.click()}
            disabled={isOptimizingBg}
            className="px-3 py-1.5 text-xs font-medium text-sky-300 bg-sky-950/70 hover:bg-sky-900 border border-sky-700/60 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            {isOptimizingBg ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Ottimizzazione sfondo...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Carica il tuo sfondo</span>
              </>
            )}
          </button>
          <input
            ref={bgFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBgUpload}
          />
        </div>

        {uploadError && (
          <div className="flex items-center gap-2 p-2.5 bg-rose-950/50 border border-rose-800/80 rounded-lg text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Custom Uploaded Background active notification */}
        {state.customBgUrl && (
          <div className="flex items-center justify-between p-2.5 bg-sky-950/40 border border-sky-800/70 rounded-lg text-xs text-sky-300">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Sfondo personalizzato attivo (da file caricato)</span>
            </span>
            <button
              onClick={() => onChange({ customBgUrl: null })}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Rimuovi</span>
            </button>
          </div>
        )}

        {/* Preset Studio Grids */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {STUDIO_BACKGROUNDS.map((bg) => {
            const isSelected = !state.customBgUrl && state.currentBgId === bg.id;
            return (
              <button
                key={bg.id}
                onClick={() => {
                  onChange({ currentBgId: bg.id, customBgUrl: null });
                }}
                className={`relative group rounded-lg overflow-hidden border text-left transition-all ${
                  isSelected
                    ? 'border-sky-500 ring-2 ring-sky-500/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="h-20 w-full bg-slate-950 relative overflow-hidden">
                  {bg.category === 'chroma' ? (
                    <div
                      className="w-full h-full flex items-center justify-center text-xs font-mono font-bold text-white shadow-inner"
                      style={{ backgroundColor: bg.chromaColor }}
                    >
                      {bg.name}
                    </div>
                  ) : (
                    <img
                      src={bg.url}
                      alt={bg.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 bg-sky-600 text-white p-1 rounded-full shadow-md">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>
                <div className="p-2 bg-slate-900/90">
                  <div className="text-xs font-medium text-slate-200 truncate">{bg.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{bg.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. PICTURE-IN-PICTURE (PiP) USER GRAPHIC */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Layout className="w-4 h-4 text-amber-400" />
            <span>Grafica Picture-in-Picture (Immagine Notizia)</span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.pip.enabled}
              onChange={(e) =>
                onChange({
                  pip: { ...state.pip, enabled: e.target.checked },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-0 w-4 h-4"
            />
            <span className="text-xs text-slate-300 font-medium">Attiva Finestra Notizia</span>
          </label>
        </div>

        {state.pip.enabled && (
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            {pipUploadError && (
              <div className="flex items-center gap-2 p-2.5 bg-rose-950/50 border border-rose-800/80 rounded-lg text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{pipUploadError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Carica Foto / Infografica:</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => pipFileInputRef.current?.click()}
                    disabled={isOptimizingPip}
                    className="flex-1 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isOptimizingPip ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        <span>Elaborazione foto...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>{state.pip.imageUrl ? 'Cambia Immagine PiP' : 'Seleziona Immagine'}</span>
                      </>
                    )}
                  </button>
                  <input
                    ref={pipFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePipUpload}
                  />
                  {state.pip.imageUrl && (
                    <button
                      onClick={() =>
                        onChange({
                          pip: { ...state.pip, imageUrl: '' },
                        })
                      }
                      className="p-2 text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                      title="Elimina immagine"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* PiP Thumbnail Preview */}
                {state.pip.imageUrl && (
                  <div className="mt-2.5 p-2 bg-slate-950/90 border border-amber-500/40 rounded-lg flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={state.pip.imageUrl}
                        alt="Anteprima PiP"
                        className="w-14 h-9 object-cover rounded border border-amber-400/40 bg-black shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-amber-300 block truncate">
                          Immagine Notizia Attiva
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          Visibile nel riquadro TV in alto
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded shrink-0">
                      Attiva
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Etichetta Notizia (Tag):</label>
                <input
                  type="text"
                  value={state.pip.topicTag}
                  onChange={(e) =>
                    onChange({
                      pip: { ...state.pip, topicTag: e.target.value },
                    })
                  }
                  placeholder="Es. ESTERI, SCIENZA, ECONOMIA"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase font-broadcast"
                />
              </div>
            </div>

            {/* Position switch */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Posizione Schermo:</span>
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() =>
                    onChange({
                      pip: { ...state.pip, position: 'top-right' },
                    })
                  }
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    state.pip.position === 'top-right'
                      ? 'bg-amber-600 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  In Alto a Destra
                </button>
                <button
                  onClick={() =>
                    onChange({
                      pip: { ...state.pip, position: 'top-left' },
                    })
                  }
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    state.pip.position === 'top-left'
                      ? 'bg-amber-600 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  In Alto a Sinistra
                </button>
              </div>
            </div>

            {/* Quick Preset Topics */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">O seleziona un'infografica rapida TG:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { tag: 'ESTERI', label: 'Esteri & Vertice', url: '/src/assets/images/global_affairs_studio_1794323880150.jpg' },
                  { tag: "ULTIM'ORA", label: 'Breaking News', url: '/src/assets/images/breaking_news_studio_1794323879177.jpg' },
                  { tag: 'ECONOMIA', label: 'Borsa & Finanza', url: '/src/assets/images/financial_tech_studio_1794323879883.jpg' },
                  { tag: 'TG NOTIZIE', label: 'Studio Live', url: '/src/assets/images/newsroom_studio_backdrop_1794323879260.jpg' },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => {
                      onChange({
                        pip: {
                          ...state.pip,
                          enabled: true,
                          imageUrl: item.url,
                          topicTag: item.tag,
                        },
                      });
                    }}
                    className={`p-1.5 rounded-lg border text-left flex items-center gap-2 transition-colors ${
                      state.pip.imageUrl === item.url
                        ? 'border-amber-400 bg-amber-950/40 text-amber-300'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <img src={item.url} alt="" className="w-8 h-6 rounded object-cover border border-slate-700 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold truncate">{item.tag}</div>
                      <div className="text-[9px] text-slate-400 truncate">{item.label}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. CAMERA & STUDIO SETTINGS */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Desk Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.deskOverlay}
              onChange={(e) => onChange({ deskOverlay: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-0 w-4 h-4"
            />
            <span className="text-xs text-slate-300 font-medium">Scrivania Bancone Notiziario</span>
          </label>

          {/* Camera Zoom */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Inquadratura Regia:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'extreme-close', label: 'Primissimo' },
                  { id: 'close', label: 'Primo Piano' },
                  { id: 'normal', label: 'Mezzo Busto' },
                  { id: 'wide', label: 'Largo' },
                ] as const
              ).map((zoom) => (
                <button
                  key={zoom.id}
                  onClick={() => onChange({ cameraZoom: zoom.id })}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    state.cameraZoom === zoom.id
                      ? 'bg-sky-600 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {zoom.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Size Slider */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center gap-4">
          <span className="text-xs text-slate-400 whitespace-nowrap">Grandezza Avatar:</span>
          <input
            type="range"
            min={140}
            max={360}
            value={Math.round((state.avatarScale || 2.3) * 100)}
            onChange={(e) =>
              onChange({ avatarScale: parseInt(e.target.value, 10) / 100 })
            }
            className="flex-1 accent-sky-500"
          />
          <span className="text-xs font-data text-sky-400 font-semibold w-12 text-right">
            {Math.round((state.avatarScale || 2.3) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
