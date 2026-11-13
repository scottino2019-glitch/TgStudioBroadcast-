import React, { useRef, useState } from 'react';
import { AnchorProfile, BroadcastState } from '../types';
import { ANCHOR_PROFILES } from '../constants/anchors';
import { User, Upload, Check, Sliders, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { optimizeUploadedImage } from '../utils/imageOptimizer';

interface AnchorSelectorProps {
  state: BroadcastState;
  onChange: (patch: Partial<BroadcastState>) => void;
  currentAnchor: AnchorProfile;
  customAnchor: AnchorProfile | null;
  onUpdateCustomAnchor: (anchor: AnchorProfile) => void;
  testMouthOpen?: boolean;
  onToggleTestMouth?: () => void;
}

export const AnchorSelector: React.FC<AnchorSelectorProps> = ({
  state,
  onChange,
  currentAnchor,
  customAnchor,
  onUpdateCustomAnchor,
  testMouthOpen = false,
  onToggleTestMouth,
}) => {
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isOptimizingPhoto, setIsOptimizingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoAspect, setPhotoAspect] = useState<{ nw: number; nh: number }>({ nw: 280, nh: 360 });
  const isDraggingMouthRef = useRef(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOptimizingPhoto(true);
    setPhotoError(null);

    // Yield to browser UI thread so spinner renders immediately without freezing
    await new Promise((r) => setTimeout(r, 25));

    try {
      // Downscale photo to 540x720 for portrait anchor frame to prevent lag
      const optimizedUrl = await optimizeUploadedImage(file, {
        maxWidth: 540,
        maxHeight: 720,
        quality: 0.82,
      });

      const newCustom: AnchorProfile = {
        id: 'custom-photo-anchor',
        name: 'Conduttore Personalizzato',
        role: 'Anchor Notiziario Custom',
        gender: 'male',
        tone: 'Personalizzato con foto utente',
        avatarType: 'custom',
        avatarStyle: 'marco',
        customImageUrl: optimizedUrl,
        mouthPosition: customAnchor?.mouthPosition || { x: 0, y: -25, scale: 1.1 },
        defaultVoice: state.selectedVoice,
        accentColor: '#38bdf8',
      };

      onUpdateCustomAnchor(newCustom);
      onChange({
        currentAnchorId: newCustom.id,
        lowerThird: {
          ...state.lowerThird,
          anchorName: newCustom.name,
          anchorTitle: newCustom.role,
        },
      });
    } catch (err: any) {
      console.error('Errore elaborazione foto conduttore:', err);
      setPhotoError(err.message || 'Impossibile elaborare la foto selezionata.');
    } finally {
      setIsOptimizingPhoto(false);
      if (photoFileInputRef.current) photoFileInputRef.current.value = '';
    }
  };

  const handleUpdateMouthCalibration = (
    patch: { x?: number; y?: number; scale?: number; gender?: 'male' | 'female' }
  ) => {
    if (!customAnchor) return;
    const current = customAnchor.mouthPosition || { x: 0, y: -25, scale: 1.1 };
    const updated: AnchorProfile = {
      ...customAnchor,
      gender: patch.gender ?? customAnchor.gender,
      mouthPosition: {
        x: patch.x !== undefined ? patch.x : current.x,
        y: patch.y !== undefined ? patch.y : current.y,
        scale: patch.scale !== undefined ? patch.scale : current.scale,
      },
    };
    onUpdateCustomAnchor(updated);
  };

  // Exact match with AvatarRenderer.ts drawCustomPhotoAnchor geometry
  const safeNw = photoAspect.nw > 0 ? photoAspect.nw : 280;
  const safeNh = photoAspect.nh > 0 ? photoAspect.nh : 360;
  const previewTargetW = 280;
  const previewTargetH = Math.min(400, Math.max(190, (safeNh / safeNw) * previewTargetW));
  const previewDrawX = -previewTargetW / 2;
  const previewDrawY = -previewTargetH / 2 + 15;

  const updateMouthFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const calcX = Math.round(previewDrawX + relX * previewTargetW);
    const calcY = Math.round(previewDrawY + relY * previewTargetH);
    handleUpdateMouthCalibration({
      x: Math.max(-135, Math.min(135, calcX)),
      y: Math.max(-180, Math.min(160, calcY)),
    });
  };

  return (
    <div className="space-y-5">
      {/* 1. ANCHOR ROSTER */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <User className="w-4 h-4 text-sky-400" />
            <span>Conduttori Notiziario & Avatar</span>
          </div>

          <button
            onClick={() => photoFileInputRef.current?.click()}
            disabled={isOptimizingPhoto}
            className="px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/60 hover:bg-amber-900 border border-amber-700/60 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            {isOptimizingPhoto ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Elaborazione foto...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Crea Avatar da Tua Foto</span>
              </>
            )}
          </button>
          <input
            ref={photoFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </div>

        {photoError && (
          <div className="flex items-center gap-2 p-2.5 bg-rose-950/50 border border-rose-800/80 rounded-lg text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{photoError}</span>
          </div>
        )}

        {/* Anchor Profiles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ANCHOR_PROFILES.map((anchor) => {
            const isSelected = state.currentAnchorId === anchor.id;
            return (
              <button
                key={anchor.id}
                onClick={() => {
                  onChange({
                    currentAnchorId: anchor.id,
                    lowerThird: {
                      ...state.lowerThird,
                      anchorName: anchor.name,
                      anchorTitle: anchor.role,
                    },
                  });
                }}
                className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-sky-500 bg-sky-950/30 ring-1 ring-sky-500/40'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-slate-100">{anchor.name}</span>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-sky-400 font-medium mb-1.5">{anchor.role}</div>
                  <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">{anchor.tone}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-data">
                  <span>Stile: {anchor.gender === 'male' ? 'Uomo' : 'Donna'}</span>
                  <span>Timbro: {anchor.gender === 'male' ? 'Maschile' : 'Femminile'}</span>
                </div>
              </button>
            );
          })}

          {/* Custom Photo Anchor card if uploaded */}
          {customAnchor && (
            <button
              onClick={() => {
                onChange({
                  currentAnchorId: customAnchor.id,
                  lowerThird: {
                    ...state.lowerThird,
                    anchorName: customAnchor.name,
                    anchorTitle: customAnchor.role,
                  },
                });
              }}
              className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                state.currentAnchorId === customAnchor.id
                  ? 'border-amber-500 bg-amber-950/30 ring-1 ring-amber-500/40'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                {customAnchor.customImageUrl && (
                  <img
                    src={customAnchor.customImageUrl}
                    alt="Foto Avatar Personalizzato"
                    className="w-12 h-14 object-cover rounded-lg border border-amber-500/60 shrink-0 bg-slate-900"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-amber-300 truncate">Foto Personale</span>
                    {state.currentAnchorId === customAnchor.id && (
                      <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-amber-400 font-medium mb-1">Foto con Lip-Sync</div>
                  <p className="text-[11px] text-slate-400 truncate">Bocca animata sulla tua foto</p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-data">
                <span className="text-emerald-400 font-medium">Foto Attiva</span>
                <span className="text-amber-400">Calibrabile</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 2. CUSTOM AVATAR CALIBRATION (Shown when custom photo anchor is selected) */}
      {currentAnchor.avatarType === 'custom' && customAnchor && (
        <div className="bg-slate-900/90 rounded-xl p-4 border border-amber-600/40 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Calibrazione Posizione Bocca Parlante (Lip-Sync)</span>
            </div>
            <div className="flex items-center gap-2">
              {onToggleTestMouth && (
                <button
                  type="button"
                  onClick={onToggleTestMouth}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    testMouthOpen
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
                  }`}
                >
                  {testMouthOpen ? 'Chiudi Test Bocca' : 'Testa Bocca Aperta'}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleUpdateMouthCalibration({ x: 0, y: -25, scale: 1.1 })}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Ripristina</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {/* Interactive Tap / Drag-to-Place Photo Preview */}
            {customAnchor.customImageUrl && (
              <div className="shrink-0 mx-auto sm:mx-0 space-y-1.5">
                <div
                  onPointerDown={(e) => {
                    isDraggingMouthRef.current = true;
                    try {
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                    } catch {
                      // Ignore unsupported pointer capture on some mobile WebViews
                    }
                    updateMouthFromPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (!isDraggingMouthRef.current) return;
                    updateMouthFromPointer(e);
                  }}
                  onPointerUp={() => {
                    isDraggingMouthRef.current = false;
                  }}
                  onPointerCancel={() => {
                    isDraggingMouthRef.current = false;
                  }}
                  className="relative w-40 rounded-xl overflow-hidden border-2 border-amber-500/70 bg-slate-950 cursor-crosshair select-none touch-none shadow-lg"
                  style={{ aspectRatio: `${previewTargetW} / ${previewTargetH}` }}
                  title="Tocca o trascina direttamente sulla bocca nella tua foto"
                >
                  <img
                    src={customAnchor.customImageUrl}
                    alt="Anteprima calibrazione bocca"
                    className="w-full h-full object-fill pointer-events-none"
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                        setPhotoAspect({ nw: el.naturalWidth, nh: el.naturalHeight });
                      }
                    }}
                  />
                  {/* Live Crosshair & Mouth Target Marker */}
                  {(() => {
                    const mx = customAnchor.mouthPosition?.x ?? 0;
                    const my = customAnchor.mouthPosition?.y ?? -25;
                    const ms = customAnchor.mouthPosition?.scale ?? 1.1;
                    const leftPct = ((mx - previewDrawX) / previewTargetW) * 100;
                    const topPct = ((my - previewDrawY) / previewTargetH) * 100;
                    const mouthW = Math.max(12, Math.round(18 * ms));
                    const mouthH = Math.max(6, Math.round((testMouthOpen ? 12 : 5) * ms));
                    return (
                      <div
                        className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                        }}
                      >
                        <div
                          className="rounded-full border-2 border-sky-400 bg-rose-500/60 shadow-[0_0_8px_rgba(56,189,248,0.9)]"
                          style={{
                            width: `${mouthW}px`,
                            height: `${mouthH}px`,
                          }}
                        />
                      </div>
                    );
                  })()}
                </div>
                <div className="text-[10px] text-center text-amber-300/90 font-medium">
                  Tocca o trascina sulla tua bocca
                </div>
              </div>
            )}

            {/* Fine-Tuning Sliders + Lip Style */}
            <div className="flex-1 w-full space-y-3">
              <p className="text-xs text-slate-400">
                Clicca direttamente sulla bocca nella foto qui accanto oppure regola con precisione i cursori:
              </p>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300">Stile Labbra:</span>
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => handleUpdateMouthCalibration({ gender: 'male' })}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      customAnchor.gender === 'male'
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Naturale / Uomo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateMouthCalibration({ gender: 'female' })}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      customAnchor.gender === 'female'
                        ? 'bg-pink-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Rossetto / Donna
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Posizione Orizzontale (X):</span>
                    <span className="font-data text-amber-300">{customAnchor.mouthPosition?.x ?? 0}px</span>
                  </div>
                  <input
                    type="range"
                    min={-135}
                    max={135}
                    value={customAnchor.mouthPosition?.x ?? 0}
                    onChange={(e) => handleUpdateMouthCalibration({ x: parseInt(e.target.value, 10) })}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Posizione Verticale (Y):</span>
                    <span className="font-data text-amber-300">{customAnchor.mouthPosition?.y ?? -25}px</span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={160}
                    value={customAnchor.mouthPosition?.y ?? -25}
                    onChange={(e) => handleUpdateMouthCalibration({ y: parseInt(e.target.value, 10) })}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Dimensione Bocca (Scala):</span>
                    <span className="font-data text-amber-300">{Math.round((customAnchor.mouthPosition?.scale ?? 1.1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={300}
                    value={Math.round((customAnchor.mouthPosition?.scale ?? 1.1) * 100)}
                    onChange={(e) => handleUpdateMouthCalibration({ scale: parseInt(e.target.value, 10) / 100 })}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. AVATAR DIMENSIONS & STUDIO FRAMING (Direct user control over avatar size) */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Sliders className="w-4 h-4 text-sky-400" />
            <span>Dimensioni & Inquadratura Avatar nello Schermo</span>
          </div>
          <button
            onClick={() =>
              onChange({
                avatarScale: 2.3,
                avatarPositionY: 0,
                avatarPositionX: 0,
                cameraZoom: 'normal',
              })
            }
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Ripristina Default</span>
          </button>
        </div>

        {/* Quick Framing Presets */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 block">Inquadratura Rapida Notiziario:</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                label: 'Primo Piano TV (Grande)',
                desc: 'Massima presenza',
                scale: 2.8,
                zoom: 'close' as const,
                posY: -20,
              },
              {
                label: 'Mezzo Busto (Standard)',
                desc: 'Classico TG',
                scale: 2.3,
                zoom: 'normal' as const,
                posY: 0,
              },
              {
                label: 'Primissimo Piano',
                desc: 'Focus espressivo',
                scale: 3.2,
                zoom: 'extreme-close' as const,
                posY: -40,
              },
              {
                label: 'Campo Largo',
                desc: 'Vista studio',
                scale: 1.7,
                zoom: 'wide' as const,
                posY: 30,
              },
            ].map((preset) => {
              const isActive =
                Math.abs((state.avatarScale || 2.3) - preset.scale) < 0.15 &&
                state.cameraZoom === preset.zoom;
              return (
                <button
                  key={preset.label}
                  onClick={() =>
                    onChange({
                      avatarScale: preset.scale,
                      cameraZoom: preset.zoom,
                      avatarPositionY: preset.posY,
                    })
                  }
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    isActive
                      ? 'border-sky-500 bg-sky-950/40 text-white font-semibold'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-medium truncate">{preset.label}</div>
                  <div className="text-[10px] text-slate-500 truncate">{preset.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fine-Tuning Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span>Grandezza Avatar:</span>
              <span className="font-data font-semibold text-sky-400">
                {Math.round((state.avatarScale || 2.3) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={130}
              max={360}
              value={Math.round((state.avatarScale || 2.3) * 100)}
              onChange={(e) =>
                onChange({ avatarScale: parseInt(e.target.value, 10) / 100 })
              }
              className="w-full accent-sky-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-data mt-0.5">
              <span>Compatto</span>
              <span>Molto Grande</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span>Altezza Verticale:</span>
              <span className="font-data text-slate-400">{state.avatarPositionY || 0}px</span>
            </div>
            <input
              type="range"
              min={-120}
              max={120}
              value={state.avatarPositionY || 0}
              onChange={(e) =>
                onChange({ avatarPositionY: parseInt(e.target.value, 10) })
              }
              className="w-full accent-sky-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-data mt-0.5">
              <span>In Alto</span>
              <span>In Basso</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span>Posizione Orizzontale:</span>
              <span className="font-data text-slate-400">{state.avatarPositionX || 0}px</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              value={state.avatarPositionX || 0}
              onChange={(e) =>
                onChange({ avatarPositionX: parseInt(e.target.value, 10) })
              }
              className="w-full accent-sky-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-data mt-0.5">
              <span>A Sinistra</span>
              <span>A Destra</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
