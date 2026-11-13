import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BroadcastState,
  AnchorProfile,
  StudioBackground,
  VisemeMetrics,
} from '../types';
import {
  createInitialAnimState,
  updateAvatarAnimation,
  drawAvatar,
  AvatarAnimState,
} from './AvatarRenderer';
import { globalAudioEngine } from '../utils/audioAnalyzer';

interface BroadcastCanvasProps {
  state: BroadcastState;
  currentAnchor: AnchorProfile;
  currentBg: StudioBackground;
  visemeMetrics: VisemeMetrics;
  isRecording: boolean;
  recordingSeconds: number;
  onSnapshot?: (dataUrl: string) => void;
  canvasRefCallback?: (canvas: HTMLCanvasElement | null) => void;
}

// In-memory image cache to eliminate re-decoding lag
const imageCache = new Map<string, HTMLImageElement>();

// Deterministic synchronous/asynchronous image loader with persistent caching
function getOrLoadImage(url: string | null | undefined): HTMLImageElement | null {
  if (!url) return null;
  let cached = imageCache.get(url);
  if (cached) {
    return cached;
  }

  const img = new Image();
  // NEVER set crossOrigin on data: or blob: URIs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    img.crossOrigin = 'anonymous';
  }

  img.onload = () => {
    imageCache.set(url, img);
  };
  img.onerror = () => {
    console.warn('Errore caricamento immagine:', url.slice(0, 50));
  };
  img.src = url;
  imageCache.set(url, img);

  if (typeof img.decode === 'function') {
    img.decode().then(() => {
      imageCache.set(url, img);
    }).catch(() => {});
  }

  return img;
}

// Safe image loader that never sets crossOrigin on data: or blob: URIs and uses decode()
function loadSafeImage(
  url: string | null | undefined,
  onLoaded: (img: HTMLImageElement) => void,
  onError?: () => void
) {
  if (!url) {
    onError?.();
    return;
  }

  // Check cache first for instant synchronous availability
  const cached = imageCache.get(url);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    onLoaded(cached);
    return;
  }

  const img = getOrLoadImage(url);
  if (!img) {
    onError?.();
    return;
  }

  if (img.complete && img.naturalWidth > 0) {
    onLoaded(img);
    return;
  }

  img.addEventListener('load', () => onLoaded(img), { once: true });
  img.addEventListener('error', () => onError?.(), { once: true });
}

export const BroadcastCanvas: React.FC<BroadcastCanvasProps> = ({
  state,
  currentAnchor,
  currentBg,
  visemeMetrics,
  isRecording,
  recordingSeconds,
  onSnapshot,
  canvasRefCallback,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animStateRef = useRef<AvatarAnimState>(createInitialAnimState());

  // Cached Image elements
  const presetBgImageRef = useRef<HTMLImageElement | null>(null);
  const customBgImageRef = useRef<HTMLImageElement | null>(null);
  const pipImageRef = useRef<HTMLImageElement | null>(null);
  const customAnchorImgRef = useRef<HTMLImageElement | null>(null);

  // Marquee scroll offset
  const tickerOffsetRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(performance.now());

  // Keep latest props in a stable ref so continuous 60fps render loop never needs to restart
  const latestPropsRef = useRef({
    state,
    currentAnchor,
    currentBg,
    visemeMetrics,
    isRecording,
    recordingSeconds,
  });

  latestPropsRef.current = {
    state,
    currentAnchor,
    currentBg,
    visemeMetrics,
    isRecording,
    recordingSeconds,
  };

  // Preload Preset Background Image
  useEffect(() => {
    if (currentBg.url) {
      loadSafeImage(
        currentBg.url,
        (img) => {
          presetBgImageRef.current = img;
        },
        () => {
          presetBgImageRef.current = null;
        }
      );
    }
  }, [currentBg.url]);

  // Preload Custom Background Image (user uploaded)
  useEffect(() => {
    if (state.customBgUrl) {
      const img = getOrLoadImage(state.customBgUrl);
      customBgImageRef.current = img;
    } else {
      customBgImageRef.current = null;
    }
  }, [state.customBgUrl]);

  // Preload PiP Image safely with immediate reference & global cache
  useEffect(() => {
    if (state.pip.enabled && state.pip.imageUrl) {
      const img = getOrLoadImage(state.pip.imageUrl);
      pipImageRef.current = img;
    } else {
      pipImageRef.current = null;
    }
  }, [state.pip.enabled, state.pip.imageUrl]);

  // Preload Custom Anchor Photo safely with immediate reference & global cache
  useEffect(() => {
    if (currentAnchor.avatarType === 'custom' && currentAnchor.customImageUrl) {
      const img = getOrLoadImage(currentAnchor.customImageUrl);
      customAnchorImgRef.current = img;
    } else {
      customAnchorImgRef.current = null;
    }
  }, [currentAnchor.avatarType, currentAnchor.customImageUrl]);

  // Register canvas with parent
  useEffect(() => {
    if (canvasRefCallback) {
      canvasRefCallback(canvasRef.current);
    }
  }, [canvasRefCallback]);

  // Main Render Loop - Continuous 60FPS loop with zero teardown lag
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      try {
        const {
          state: curState,
          currentAnchor: curAnchor,
          currentBg: curBg,
          isRecording: curIsRec,
          recordingSeconds: curRecSecs,
        } = latestPropsRef.current;

        const curViseme = globalAudioEngine.getIsPlaying()
          ? globalAudioEngine.getCurrentMetrics()
          : latestPropsRef.current.visemeMetrics;

        const now = performance.now();
        const dt = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000);
        lastFrameTimeRef.current = now;

        // Update animation state (blinks, gaze saccades)
        animStateRef.current = updateAvatarAnimation(animStateRef.current, now);

        const W = canvas.width;
        const H = canvas.height;

        // 1. LAYER 0: BACKGROUND
        ctx.clearRect(0, 0, W, H);

        let drewBg = false;

        // Check user-uploaded custom background first
        if (curState.customBgUrl && customBgImageRef.current) {
          const customImg = customBgImageRef.current;
          if (customImg.complete && customImg.naturalWidth > 0) {
            try {
              const nw = customImg.naturalWidth || customImg.width || 1920;
              const nh = customImg.naturalHeight || customImg.height || 1080;
              const scale = Math.max(W / nw, H / nh);
              const dw = nw * scale;
              const dh = nh * scale;
              const dx = (W - dw) / 2;
              const dy = (H - dh) / 2;
              ctx.drawImage(customImg, dx, dy, dw, dh);

              // Subtle broadcast vignette
              const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
              vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
              vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
              ctx.fillStyle = vignette;
              ctx.fillRect(0, 0, W, H);
              drewBg = true;
            } catch (err) {
              console.warn('Errore rendering sfondo custom:', err);
            }
          }
        }

        // Fallback to Chroma or Preset Studio Background
        if (!drewBg) {
          if (curBg.category === 'chroma' && curBg.chromaColor) {
            ctx.fillStyle = curBg.chromaColor;
            ctx.fillRect(0, 0, W, H);
            drewBg = true;
          } else if (presetBgImageRef.current && presetBgImageRef.current.complete && presetBgImageRef.current.naturalWidth > 0) {
            try {
              const img = presetBgImageRef.current;
              const nw = img.naturalWidth || img.width || 1920;
              const nh = img.naturalHeight || img.height || 1080;
              const scale = Math.max(W / nw, H / nh);
              const dw = nw * scale;
              const dh = nh * scale;
              const dx = (W - dw) / 2;
              const dy = (H - dh) / 2;
              ctx.drawImage(img, dx, dy, dw, dh);

              const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
              vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
              vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
              ctx.fillStyle = vignette;
              ctx.fillRect(0, 0, W, H);
              drewBg = true;
            } catch (err) {
              console.warn('Errore rendering sfondo preset:', err);
            }
          }
        }

        // Absolute fallback: TV Studio dark gradient
        if (!drewBg) {
          const grad = ctx.createLinearGradient(0, 0, 0, H);
          grad.addColorStop(0, '#09152e');
          grad.addColorStop(0.5, '#020617');
          grad.addColorStop(1, '#050c1f');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);
        }

        // 2. LAYER 1: AVATAR
        const zoomMult =
          curState.cameraZoom === 'extreme-close'
            ? 1.55
            : curState.cameraZoom === 'close'
            ? 1.28
            : curState.cameraZoom === 'wide'
            ? 0.88
            : 1.05;

        const baseScale = curState.avatarScale || 2.25;
        const finalScale = baseScale * zoomMult;

        // Position anchor prominently in optical center with user offsets
        const offsetX = curState.avatarPositionX || 0;
        const offsetY = curState.avatarPositionY || 0;

        const anchorX = curState.pip.enabled
          ? (curState.pip.position === 'top-right' ? W * 0.38 : W * 0.62) + offsetX
          : W * 0.5 + offsetX;

        const anchorY = H * 0.51 + offsetY;

        drawAvatar(
          ctx,
          curAnchor,
          curViseme,
          animStateRef.current,
          anchorX,
          anchorY,
          finalScale,
          customAnchorImgRef.current
        );

        // 3. LAYER 2: ANCHOR DESK OVERLAY
        if (curState.deskOverlay && curBg.category !== 'chroma') {
          drawNewsDesk(ctx, W, H);
        }

        // 4. LAYER 3: PICTURE-IN-PICTURE (PiP) GRAPHIC
        if (curState.pip.enabled) {
          try {
            drawPipWindow(ctx, W, H, curState.pip, pipImageRef.current);
          } catch (pipErr) {
            console.warn('Errore rendering PiP:', pipErr);
          }
        }

        // 5. LAYER 4: CHANNEL WATERMARK & LIVE BUG
        if (curState.watermark.enabled) {
          drawWatermark(ctx, W, curState.watermark, curIsRec);
        }

        // 6. LAYER 5: LOWER THIRD (SOTTOPANCIA)
        if (curState.lowerThird.enabled) {
          drawLowerThird(ctx, W, H, curState.lowerThird);
        }

        // 7. LAYER 6: CONTINUOUS TICKER (STRISCIA NOTIZIE)
        if (curState.ticker.enabled) {
          tickerOffsetRef.current += (W / Math.max(10, curState.ticker.speed)) * dt;
          drawTicker(ctx, W, H, curState.ticker, tickerOffsetRef.current);
        }

        // 8. LAYER 7: TITOLI DI CODA (BROADCAST END CREDITS SLATE)
        if (curState.showCreditsNow && curState.endCredits.enabled) {
          drawEndCreditsSlate(ctx, W, H, curState.endCredits, curAnchor);
        }

        // 9. ON-AIR RECORDING INDICATOR
        if (curIsRec) {
          drawRecordingBug(ctx, W, curRecSecs);
        }
      } catch (renderError) {
        console.error('Frame render exception:', renderError);
      } finally {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const handleCaptureSnapshot = useCallback(() => {
    if (canvasRef.current && onSnapshot) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onSnapshot(dataUrl);
    }
  }, [onSnapshot]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800 group">
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        className="w-full h-full object-contain block"
      />

      {/* Quick Action Overlay (Hover) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/80 backdrop-blur-md p-1.5 rounded-lg border border-slate-700/60 z-20">
        <button
          onClick={handleCaptureSnapshot}
          className="px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded transition-colors whitespace-nowrap"
          title="Salva fotogramma ad alta risoluzione"
        >
          Istantanea 1080p
        </button>
      </div>

      {/* Live Speaking Indicator in corner */}
      {visemeMetrics.isSpeaking && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-500/40 text-xs font-data text-emerald-400 z-20">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
          <span>LIP-SYNC ATTIVO</span>
          <span className="text-slate-400">·</span>
          <span>APERTURA {Math.round(visemeMetrics.openness * 100)}%</span>
        </div>
      )}

      {/* Off-screen Pre-Decoders for zero-delay canvas rendering */}
      {state.pip.enabled && state.pip.imageUrl && (
        <img
          key={`pip-cache-${state.pip.imageUrl.length}-${state.pip.imageUrl.slice(-32)}`}
          src={state.pip.imageUrl}
          alt=""
          className="hidden"
          aria-hidden="true"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0) {
              imageCache.set(state.pip.imageUrl, el);
              pipImageRef.current = el;
            }
          }}
        />
      )}
      {state.customBgUrl && (
        <img
          key={`bg-cache-${state.customBgUrl.length}-${state.customBgUrl.slice(-32)}`}
          src={state.customBgUrl}
          alt=""
          className="hidden"
          aria-hidden="true"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0) {
              imageCache.set(state.customBgUrl!, el);
              customBgImageRef.current = el;
            }
          }}
        />
      )}
      {currentAnchor.avatarType === 'custom' && currentAnchor.customImageUrl && (
        <img
          key={`anchor-cache-${currentAnchor.customImageUrl.length}-${currentAnchor.customImageUrl.slice(-32)}`}
          src={currentAnchor.customImageUrl}
          alt=""
          className="hidden"
          aria-hidden="true"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0) {
              imageCache.set(currentAnchor.customImageUrl!, el);
              customAnchorImgRef.current = el;
            }
          }}
        />
      )}
    </div>
  );
};

// --- DRAWING HELPERS ---

function drawNewsDesk(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.save();
  const deskTopY = H * 0.81;

  // Glass desk curved surface
  ctx.beginPath();
  ctx.moveTo(W * 0.1, H);
  ctx.lineTo(W * 0.18, deskTopY);
  ctx.bezierCurveTo(W * 0.35, deskTopY - 14, W * 0.65, deskTopY - 14, W * 0.82, deskTopY);
  ctx.lineTo(W * 0.9, H);
  ctx.closePath();

  // Polished glass / wood gradient
  const deskGrad = ctx.createLinearGradient(0, deskTopY - 20, 0, H);
  deskGrad.addColorStop(0, 'rgba(30, 41, 59, 0.88)');
  deskGrad.addColorStop(0.15, 'rgba(15, 23, 42, 0.96)');
  deskGrad.addColorStop(1, 'rgba(2, 6, 23, 1)');
  ctx.fillStyle = deskGrad;
  ctx.fill();

  // Rim reflection light
  ctx.beginPath();
  ctx.moveTo(W * 0.18, deskTopY);
  ctx.bezierCurveTo(W * 0.35, deskTopY - 14, W * 0.65, deskTopY - 14, W * 0.82, deskTopY);
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.7)';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Subtle studio tablet on desk
  ctx.save();
  ctx.translate(W * 0.36, deskTopY + 18);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(-45, -28, 90, 56, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Screen glow
  ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
  ctx.fillRect(-40, -24, 80, 48);
  ctx.restore();

  ctx.restore();
}

function drawPipWindow(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pip: BroadcastState['pip'],
  imgFromRef: HTMLImageElement | null
) {
  ctx.save();
  const pipW = 480;
  const pipH = 270;
  const margin = 50;
  const x = pip.position === 'top-right' ? W - pipW - margin : margin;
  const y = 90;

  // Window Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;

  // Window Outer Frame
  ctx.fillStyle = '#0f172a';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x - 5, y - 5, pipW + 10, pipH + 10, 10);
    ctx.fill();
  } else {
    ctx.fillRect(x - 5, y - 5, pipW + 10, pipH + 10);
  }

  ctx.shadowColor = 'transparent';

  // Inner Image Clip
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, pipW, pipH, 8);
  } else {
    ctx.rect(x, y, pipW, pipH);
  }
  ctx.clip();

  // Resolve target image: ref first, then imageCache, then on-demand loader
  let targetImg = imgFromRef;
  if (!targetImg || (!targetImg.complete && targetImg.naturalWidth === 0)) {
    if (pip.imageUrl) {
      targetImg = imageCache.get(pip.imageUrl) || getOrLoadImage(pip.imageUrl);
    }
  }

  let drewImage = false;
  if (targetImg) {
    const isReady =
      (targetImg.naturalWidth > 0 && targetImg.naturalHeight > 0) ||
      (targetImg.complete && targetImg.width > 0 && targetImg.height > 0);

    if (isReady) {
      const nw = targetImg.naturalWidth || targetImg.width || pipW;
      const nh = targetImg.naturalHeight || targetImg.height || pipH;
      if (nw > 0 && nh > 0) {
        const scale = Math.max(pipW / nw, pipH / nh);
        const iw = nw * scale;
        const ih = nh * scale;
        const ix = x + (pipW - iw) / 2;
        const iy = y + (pipH - ih) / 2;
        try {
          ctx.drawImage(targetImg, ix, iy, iw, ih);
          drewImage = true;
        } catch (pipDrawErr) {
          console.warn('Errore drawImage PiP:', pipDrawErr);
        }
      }
    }
  }

  if (!drewImage) {
    // Television newsroom graphic placeholder
    const grad = ctx.createLinearGradient(x, y, x + pipW, y + pipH);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, pipW, pipH);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COLLEGAMENTO NOTIZIA', x + pipW / 2, y + pipH / 2 - 10);

    ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(
      pip.imageUrl ? 'Caricamento foto...' : 'Seleziona immagine nella scheda Sfondi & Media',
      x + pipW / 2,
      y + pipH / 2 + 18
    );
  }

  // Subtle border highlight
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
  ctx.lineWidth = 2;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, pipW, pipH, 8);
    ctx.stroke();
  } else {
    ctx.strokeRect(x, y, pipW, pipH);
  }
  ctx.restore(); // Restores Inner Image Clip

  // PiP Topic Ribbon
  if (pip.topicTag) {
    ctx.save();
    ctx.font = '700 20px "Barlow Condensed", sans-serif';
    const tagText = pip.topicTag.toUpperCase();
    const tagW = ctx.measureText(tagText).width + 24;

    ctx.fillStyle = '#dc2626';
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x + 12, y + pipH - 38, tagW, 30, 4);
      ctx.fill();
    } else {
      ctx.fillRect(x + 12, y + pipH - 38, tagW, 30);
    }

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, x + 24, y + pipH - 23);
    ctx.restore();
  }

  ctx.restore(); // Restores Window
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  watermark: BroadcastState['watermark'],
  _isRecording: boolean
) {
  ctx.save();
  const isRight = watermark.position === 'top-right';
  const x = isRight ? W - 60 : 60;
  const y = 50;

  ctx.textAlign = isRight ? 'right' : 'left';

  // Channel Brand Name
  ctx.font = '900 32px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 8;
  ctx.fillText(watermark.text.toUpperCase(), x, y);

  // Live Pill / Subtext
  if (watermark.subtext) {
    ctx.font = '700 16px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.fillText(watermark.subtext.toUpperCase(), x, y + 26);
  }

  ctx.restore();
}

function drawLowerThird(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cfg: BroadcastState['lowerThird']
) {
  ctx.save();
  const baseY = H * 0.715; // Positioned cleanly above the 136px ticker with generous breathing room
  const leftX = W * 0.05;
  const maxW = W * 0.90;

  // 1. Category Tag (e.g. ULTIM'ORA / BREAKING NEWS)
  if (cfg.category) {
    ctx.font = '900 28px "Plus Jakarta Sans", "Barlow Condensed", sans-serif';
    const catText = cfg.category.toUpperCase();
    const catW = ctx.measureText(catText).width + 42;

    ctx.fillStyle = cfg.style === 'breaking' ? '#dc2626' : '#2563eb';
    ctx.beginPath();
    ctx.roundRect(leftX, baseY - 50, catW, 46, [8, 8, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(catText, leftX + 21, baseY - 27);
  }

  // 2. Primary Headline Box - Prominent & Highly Legible
  const headlineHeight = 84;
  ctx.fillStyle = 'rgba(10, 15, 29, 0.98)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.roundRect(leftX, baseY - 4, maxW, headlineHeight, [0, 10, 0, 0]);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Left Color Accent Strip
  ctx.fillStyle = cfg.style === 'breaking' ? '#ef4444' : '#3b82f6';
  ctx.fillRect(leftX, baseY - 4, 12, headlineHeight);

  // Headline Text - 44px bold broadcast typography
  ctx.font = '900 44px "Plus Jakarta Sans", "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.headline, leftX + 32, baseY + 38, maxW - 64);

  // 3. Subheadline / Location Bar
  if (cfg.subheadline) {
    const subH = 44;
    ctx.fillStyle = 'rgba(23, 32, 51, 0.96)';
    ctx.fillRect(leftX, baseY + headlineHeight - 4, maxW * 0.78, subH);

    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#93c5fd';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.subheadline.toUpperCase(), leftX + 32, baseY + headlineHeight + 18, maxW * 0.74);
  }

  // 4. Anchor Name & Role Bug (Right side of lower third)
  if (cfg.anchorName) {
    ctx.textAlign = 'right';
    const nameX = leftX + maxW - 28;

    ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(cfg.anchorName.toUpperCase(), nameX, baseY + 30);

    if (cfg.anchorTitle) {
      ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(cfg.anchorTitle, nameX, baseY + 58);
    }
  }

  ctx.restore();
}

function drawTicker(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  ticker: BroadcastState['ticker'],
  offset: number
) {
  ctx.save();
  const tickerH = 136; // Ultra-legible 136px broadcast ticker bar
  const y = H - tickerH;

  // Background styling with ultra-crisp high-contrast TV palette
  let barBg = '#000000';
  let tagBg = '#111827';
  let tagTextColor = '#facc15';
  let textColor = '#ffffff';
  let topAccentColor = '#facc15';
  let strokeColor = '#000000';

  if (ticker.bgStyle === 'red') {
    barBg = '#7f1d1d'; // Deep broadcast crimson
    tagBg = '#450a0a'; // Darker wine red badge
    tagTextColor = '#fef08a';
    textColor = '#ffffff';
    topAccentColor = '#fef08a';
    strokeColor = '#000000';
  } else if (ticker.bgStyle === 'yellow') {
    barBg = '#facc15'; // High-visibility yellow
    tagBg = '#000000'; // Pure black tag
    tagTextColor = '#facc15';
    textColor = '#000000'; // Jet black text on yellow
    topAccentColor = '#000000';
    strokeColor = 'transparent';
  } else if (ticker.bgStyle === 'navy' || ticker.bgStyle === 'blue') {
    barBg = '#0f172a'; // Deep Broadcast Navy
    tagBg = '#1d4ed8'; // Cobalt tag
    tagTextColor = '#ffffff';
    textColor = '#ffffff';
    topAccentColor = '#38bdf8';
    strokeColor = '#020617';
  } else {
    // 'black' (Nero HD): Pure Solid Black with zero red bleed & maximum luminance contrast
    barBg = '#000000';
    tagBg = '#111827';
    tagTextColor = '#facc15';
    textColor = '#ffffff';
    topAccentColor = '#facc15';
    strokeColor = '#000000';
  }

  // 1. Full ticker background bar (100% opaque solid fill)
  ctx.fillStyle = barBg;
  ctx.fillRect(0, y, W, tickerH);

  // 2. Top accent highlight strip
  ctx.fillStyle = topAccentColor;
  ctx.fillRect(0, y, W, 5);

  // 3. Stationary Station Badge
  const tagW = 280;
  ctx.fillStyle = tagBg;
  ctx.fillRect(0, y + 5, tagW, tickerH - 5);

  // Station Badge Text
  ctx.font = '800 32px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillStyle = tagTextColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((ticker.label || 'TG 24 LIVE').toUpperCase(), tagW / 2, y + tickerH / 2 + 2, tagW - 24);

  // Vertical separator between stationary badge and marquee
  ctx.fillStyle = topAccentColor;
  ctx.fillRect(tagW - 4, y, 4, tickerH);

  // 4. Marquee Text Area (Clipped cleanly right of the badge)
  ctx.save();
  ctx.beginPath();
  ctx.rect(tagW, y, W - tagW, tickerH);
  ctx.clip();

  // Sharp, large broadcast typography (weight 800 matches loaded Google Font)
  let fontPixels = 64;
  if (ticker.fontSize === 'gigantic') fontPixels = 76;
  else if (ticker.fontSize === 'huge') fontPixels = 64;
  else if (ticker.fontSize === 'large') fontPixels = 52;
  else if (ticker.fontSize === 'standard') fontPixels = 44;

  ctx.font = `800 ${fontPixels}px "Plus Jakarta Sans", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const cleanTickerText = (ticker.text || '').replace(/\s+/g, ' ').trim();
  const unitText = cleanTickerText ? `${cleanTickerText}   ●   ` : 'TG STUDIO LIVE   ●   ';
  const unitWidth = Math.max(200, ctx.measureText(unitText).width);
  const loopOffset = -(offset % unitWidth);

  const textY = y + tickerH / 2 + 3;

  // Draw only visible marquee segments across [tagW, W] for sharp 60fps performance
  for (let posX = tagW + loopOffset; posX < W; posX += unitWidth) {
    if (posX + unitWidth >= tagW) {
      if (strokeColor !== 'transparent') {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeText(unitText, posX, textY);
      }
      ctx.fillStyle = textColor;
      ctx.fillText(unitText, posX, textY);
    }
  }

  ctx.restore();
  ctx.beginPath();
  ctx.restore();
}

function drawEndCreditsSlate(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  credits: BroadcastState['endCredits'],
  anchor: AnchorProfile
) {
  ctx.save();
  // 100% Solid opaque deep slate background so credits are crystal clear
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, W, H);

  // Subtle studio light cones
  const grad = ctx.createRadialGradient(W / 2, H * 0.4, 80, W / 2, H * 0.4, 900);
  grad.addColorStop(0, 'rgba(30, 58, 138, 0.35)');
  grad.addColorStop(0.6, 'rgba(15, 23, 42, 0.8)');
  grad.addColorStop(1, '#030712');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Broadcast Credits Card
  const cardW = 1280;
  const cardH = 840;
  const cardX = (W - cardW) / 2;
  const cardY = (H - cardH) / 2;

  // Outer glow & card background
  ctx.shadowColor = 'rgba(56, 189, 248, 0.35)';
  ctx.shadowBlur = 50;
  ctx.fillStyle = '#090d1a';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 20);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Metallic border
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Top Red Accent Banner
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, 100, [20, 20, 0, 0]);
  ctx.fill();

  // Gold accent line under banner
  ctx.fillStyle = '#facc15';
  ctx.fillRect(cardX, cardY + 97, cardW, 4);

  // Header Title
  ctx.font = '900 44px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 10;
  ctx.fillText('TITOLI DI CODA · FINE TRASMISSIONE', W / 2, cardY + 50);
  ctx.shadowColor = 'transparent';

  // Content Credits List
  const startY = cardY + 175;
  const rows = [
    { role: 'EDIZIONE NOTIZIARIO', val: credits.edition || 'Edizione Straordinaria TG Studio HD' },
    { role: 'CONDUTTORE IN STUDIO', val: anchor.name },
    { role: 'REDAZIONE GIORNALISTICA', val: credits.production || 'Redazione Notizie Internazionali HD' },
    { role: 'REGIA & PRODUZIONE', val: credits.director || 'Studio TG Broadcast' },
    { role: 'SINTESI VOCALE & LIP-SYNC', val: credits.audioTech || 'Google Text-to-Speech & Lip-Sync Neurale' },
  ];

  ctx.textAlign = 'center';
  rows.forEach((row, idx) => {
    const yPos = startY + idx * 92;

    // Role Tag (Cyan)
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#38bdf8'; // Bright Sky Blue
    ctx.fillText(row.role.toUpperCase(), W / 2, yPos);

    // Value Name (Large Bold White)
    ctx.font = '900 38px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(row.val, W / 2, yPos + 38);

    // Hairline divider
    if (idx < rows.length - 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(W / 2 - 340, yPos + 66, 680, 1.5);
    }
  });

  // Closing Sign-Off Message
  if (credits.customNotes) {
    ctx.font = 'italic 700 30px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#facc15'; // Gold
    ctx.fillText(`“${credits.customNotes}”`, W / 2, cardY + cardH - 55);
  }

  ctx.restore();
}

function drawRecordingBug(ctx: CanvasRenderingContext2D, W: number, seconds: number) {
  ctx.save();
  const x = W / 2;
  const y = 46;

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const timeStr = `REC  ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  ctx.font = '700 18px "JetBrains Mono", monospace';
  const textW = ctx.measureText(timeStr).width + 36;

  ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
  ctx.beginPath();
  ctx.roundRect(x - textW / 2, y - 20, textW, 36, 18);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(timeStr, x, y - 2);

  ctx.restore();
}
