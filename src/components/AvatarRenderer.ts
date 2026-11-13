import { AnchorProfile, VisemeMetrics } from '../types';

export interface AvatarAnimState {
  blinkProgress: number; // 0 = open, 1 = closed
  lastBlinkTime: number;
  nextBlinkInterval: number;
  saccadeX: number;
  saccadeY: number;
  lastSaccadeTime: number;
}

export function createInitialAnimState(): AvatarAnimState {
  return {
    blinkProgress: 0,
    lastBlinkTime: performance.now(),
    nextBlinkInterval: 3500 + Math.random() * 2000,
    saccadeX: 0,
    saccadeY: 0,
    lastSaccadeTime: performance.now(),
  };
}

export function updateAvatarAnimation(state: AvatarAnimState, now: number): AvatarAnimState {
  const next = { ...state };

  // Blink logic
  const timeSinceBlink = now - next.lastBlinkTime;
  if (timeSinceBlink > next.nextBlinkInterval) {
    const blinkDuration = 180; // ms
    const progressInBlink = (timeSinceBlink - next.nextBlinkInterval) / blinkDuration;
    if (progressInBlink >= 1) {
      next.blinkProgress = 0;
      next.lastBlinkTime = now;
      next.nextBlinkInterval = 3000 + Math.random() * 3000;
    } else {
      // Smooth sinusoidal blink curve
      next.blinkProgress = Math.sin(progressInBlink * Math.PI);
    }
  } else {
    next.blinkProgress = 0;
  }

  // Eye micro-saccades (subtle teleprompter gaze movement)
  if (now - next.lastSaccadeTime > 2500 + Math.random() * 2000) {
    next.saccadeX = (Math.random() - 0.5) * 3;
    next.saccadeY = (Math.random() - 0.5) * 1.5;
    next.lastSaccadeTime = now;
  }

  return next;
}

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  anchor: AnchorProfile,
  metrics: VisemeMetrics,
  anim: AvatarAnimState,
  centerX: number,
  centerY: number,
  scale: number,
  customImageObj: HTMLImageElement | null
) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);

  // If user uploaded custom anchor photo
  if (anchor.avatarType === 'custom') {
    if (customImageObj && (customImageObj.complete || (customImageObj.naturalWidth && customImageObj.naturalWidth > 0))) {
      drawCustomPhotoAnchor(ctx, customImageObj, anchor, metrics, anim);
    } else {
      drawCustomPhotoPlaceholder(ctx, anchor);
    }
    ctx.restore();
    return;
  }

  // Preset stylised high-fidelity anchor
  const now = performance.now();
  // Breathing and subtle head nod with audio volume
  const breath = Math.sin(now * 0.0018) * 2;
  const speechNod = metrics.volume * 4;
  const headAngle = (Math.sin(now * 0.0012) * 0.8 + (metrics.volume > 0.4 ? 0.6 : 0)) * (Math.PI / 180);

  // --- 1. SHOULDERS & SUIT BODY ---
  ctx.save();
  ctx.translate(0, breath);

  // Body palette
  const suitColors = {
    marco: { suit: '#1e293b', lapel: '#0f172a', tie: '#991b1b', shirt: '#f8fafc' },
    elena: { suit: '#1e1b4b', lapel: '#312e81', tie: '', shirt: '#f1f5f9' },
    kenji: { suit: '#27272a', lapel: '#18181b', tie: '#0f766e', shirt: '#f8fafc' },
    svetlana: { suit: '#064e3b', lapel: '#022c22', tie: '', shirt: '#f0fdf4' },
    amira: { suit: '#4c0519', lapel: '#881337', tie: '', shirt: '#fff1f2' },
  }[anchor.avatarStyle] || { suit: '#1e293b', lapel: '#0f172a', tie: '#991b1b', shirt: '#f8fafc' };

  // Torso / Shoulders
  ctx.beginPath();
  ctx.moveTo(-220, 340);
  ctx.lineTo(-185, 220);
  ctx.bezierCurveTo(-160, 140, -100, 105, -55, 95);
  ctx.lineTo(55, 95);
  ctx.bezierCurveTo(100, 105, 160, 140, 185, 220);
  ctx.lineTo(220, 340);
  ctx.closePath();
  ctx.fillStyle = suitColors.suit;
  ctx.fill();

  // Suit shadow / texture
  const suitGrad = ctx.createLinearGradient(-180, 100, 180, 340);
  suitGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  suitGrad.addColorStop(0.5, 'transparent');
  suitGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = suitGrad;
  ctx.fill();

  // Shirt Collar & Tie / Blouse
  ctx.beginPath();
  ctx.moveTo(-35, 95);
  ctx.lineTo(0, 145);
  ctx.lineTo(35, 95);
  ctx.closePath();
  ctx.fillStyle = suitColors.shirt;
  ctx.fill();

  if (suitColors.tie) {
    // Tie for male anchors
    ctx.beginPath();
    ctx.moveTo(-9, 105);
    ctx.lineTo(9, 105);
    ctx.lineTo(14, 210);
    ctx.lineTo(0, 230);
    ctx.lineTo(-14, 210);
    ctx.closePath();
    ctx.fillStyle = suitColors.tie;
    ctx.fill();

    // Tie knot
    ctx.beginPath();
    ctx.moveTo(-11, 98);
    ctx.lineTo(11, 98);
    ctx.lineTo(8, 115);
    ctx.lineTo(-8, 115);
    ctx.closePath();
    ctx.fillStyle = '#7f1d1d';
    ctx.fill();
  } else {
    // Female necklace / blouse fold
    ctx.beginPath();
    ctx.arc(0, 108, 12, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Suit Lapels
  ctx.beginPath();
  ctx.moveTo(-50, 95);
  ctx.lineTo(-20, 150);
  ctx.lineTo(0, 180);
  ctx.lineTo(-35, 185);
  ctx.lineTo(-70, 125);
  ctx.closePath();
  ctx.fillStyle = suitColors.lapel;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(50, 95);
  ctx.lineTo(20, 150);
  ctx.lineTo(0, 180);
  ctx.lineTo(35, 185);
  ctx.lineTo(70, 125);
  ctx.closePath();
  ctx.fillStyle = suitColors.lapel;
  ctx.fill();

  ctx.restore(); // end body

  // --- 2. HEAD & FACE RIG ---
  ctx.save();
  ctx.translate(0, speechNod);
  ctx.rotate(headAngle);

  // Neck
  ctx.beginPath();
  ctx.moveTo(-24, 30);
  ctx.lineTo(-26, 100);
  ctx.lineTo(26, 100);
  ctx.lineTo(24, 30);
  ctx.closePath();
  ctx.fillStyle = '#f6c3a5';
  ctx.fill();

  // Neck shadow under chin
  ctx.beginPath();
  ctx.ellipse(0, 48, 22, 10, 0, 0, Math.PI);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();

  // Head base shape (Jaw and skull)
  const skinTones = {
    marco: '#fcd3b8',
    elena: '#fedec9',
    kenji: '#f7d0b3',
    svetlana: '#ffe3d3',
    amira: '#e8b290',
  }[anchor.avatarStyle] || '#fcd3b8';

  // Ears
  ctx.fillStyle = skinTones;
  ctx.beginPath();
  ctx.ellipse(-52, -5, 8, 16, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(52, -5, 8, 16, 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Head Contour
  ctx.beginPath();
  ctx.moveTo(-48, -25);
  ctx.bezierCurveTo(-50, -85, 50, -85, 48, -25);
  ctx.bezierCurveTo(48, 20, 36, 52, 0, 58); // chin
  ctx.bezierCurveTo(-36, 52, -48, 20, -48, -25);
  ctx.closePath();
  ctx.fillStyle = skinTones;
  ctx.fill();

  // Subtle cheek highlights & shadow
  ctx.beginPath();
  ctx.ellipse(-30, 2, 12, 7, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 113, 133, 0.12)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(30, 2, 12, 7, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 113, 133, 0.12)';
  ctx.fill();

  // Nose
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(2, 6);
  ctx.lineTo(6, 8);
  ctx.lineTo(-4, 9);
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.25)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Eyebrows (move with vocal emphasis)
  const browRaise = metrics.volume > 0.4 ? (metrics.volume - 0.4) * 6 : 0;
  ctx.fillStyle = anchor.avatarStyle === 'elena' || anchor.avatarStyle === 'svetlana' ? '#78350f' : '#27272a';

  // Left Eyebrow
  ctx.beginPath();
  ctx.moveTo(-36, -26 - browRaise);
  ctx.quadraticCurveTo(-24, -33 - browRaise, -10, -28 - browRaise);
  ctx.lineTo(-11, -25 - browRaise);
  ctx.quadraticCurveTo(-24, -29 - browRaise, -36, -23 - browRaise);
  ctx.closePath();
  ctx.fill();

  // Right Eyebrow
  ctx.beginPath();
  ctx.moveTo(36, -26 - browRaise);
  ctx.quadraticCurveTo(24, -33 - browRaise, 10, -28 - browRaise);
  ctx.lineTo(11, -25 - browRaise);
  ctx.quadraticCurveTo(24, -29 - browRaise, 36, -23 - browRaise);
  ctx.closePath();
  ctx.fill();

  // Eyes (with natural blink & saccade)
  drawEye(ctx, -22 + anim.saccadeX, -14 + anim.saccadeY, anim.blinkProgress, anchor.avatarStyle);
  drawEye(ctx, 22 + anim.saccadeX, -14 + anim.saccadeY, anim.blinkProgress, anchor.avatarStyle);

  // Eyeglasses for Kenji
  if (anchor.avatarStyle === 'kenji') {
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(-35, -23, 26, 17);
    ctx.strokeRect(9, -23, 26, 17);
    ctx.beginPath();
    ctx.moveTo(-9, -15);
    ctx.lineTo(9, -15);
    ctx.stroke();
  }

  // --- 3. ACCURATE LIP-SYNC MOUTH RIG ---
  drawLipSyncMouth(ctx, 0, 28, metrics, anchor.avatarStyle);

  // --- 4. HAIRSTYLE (OVER HEAD) ---
  drawHair(ctx, anchor.avatarStyle);

  ctx.restore(); // end head
  ctx.restore(); // end scale & translate
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  blink: number,
  style: string
) {
  ctx.save();
  ctx.translate(cx, cy);

  if (blink > 0.8) {
    // Eye is closed / mid-blink
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.quadraticCurveTo(0, 3, 11, 0);
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Sclera (White)
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 6.5 * (1 - blink * 0.9), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Iris
    const irisColor = style === 'svetlana' ? '#0284c7' : style === 'elena' ? '#059669' : '#3f2212';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.8, 4.8 * (1 - blink * 0.8), 0, 0, Math.PI * 2);
    ctx.fillStyle = irisColor;
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.5, 2.5 * (1 - blink * 0.8), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#09090b';
    ctx.fill();

    // Catchlight highlight
    ctx.beginPath();
    ctx.arc(1.5, -1.5, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();

    // Eyelash upper line
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.quadraticCurveTo(0, -7.5 * (1 - blink), 12, -2);
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  ctx.restore();
}

function drawLipSyncMouth(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  metrics: VisemeMetrics,
  style: string
) {
  ctx.save();
  ctx.translate(mx, my);

  const open = Math.max(0, Math.min(1, metrics.openness));
  const widthNorm = Math.max(0, Math.min(1, metrics.width)); // 0 = narrow/round, 1 = wide
  const teeth = Math.max(0, Math.min(1, metrics.teeth));

  // Dynamic geometric dimensions based on viseme formants
  const halfWidth = 12 + widthNorm * 7; // 12px to 19px
  const maxDrop = open * 14;            // 0px to 14px aperture
  const lipThickness = 3;

  // Lip colors
  const isFemale = style === 'elena' || style === 'svetlana' || style === 'amira';
  const lipColor = isFemale ? '#be185d' : '#be6e5e';
  const lipShade = isFemale ? '#831843' : '#883b2d';

  if (open < 0.05) {
    // RESTING CLOSED MOUTH
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    // Slight welcoming television smile
    ctx.quadraticCurveTo(-halfWidth * 0.5, -1, 0, 0.5);
    ctx.quadraticCurveTo(halfWidth * 0.5, -1, halfWidth, 0);
    ctx.strokeStyle = lipShade;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Upper lip contour
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    ctx.quadraticCurveTo(0, -3.5, halfWidth, 0);
    ctx.strokeStyle = lipColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Lower lip highlight
    ctx.beginPath();
    ctx.ellipse(0, 3, halfWidth * 0.6, 2, 0, 0, Math.PI);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fill();
  } else {
    // OPEN SPEAKING MOUTH
    // 1. Oral cavity (dark interior)
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    // Upper lip dip (cupid's bow)
    ctx.quadraticCurveTo(-halfWidth * 0.4, -maxDrop * 0.25, 0, -maxDrop * 0.15);
    ctx.quadraticCurveTo(halfWidth * 0.4, -maxDrop * 0.25, halfWidth, 0);
    // Lower jaw opening
    ctx.quadraticCurveTo(0, maxDrop * 1.3 + 3, -halfWidth, 0);
    ctx.closePath();
    ctx.fillStyle = '#2a0910'; // deep oral cavity
    ctx.fill();

    // 2. Teeth (upper & lower visible depending on viseme and sibilance)
    if (teeth > 0.1 || open > 0.2) {
      // Upper Teeth
      const teethHeight = Math.min(maxDrop * 0.4 + teeth * 3, 5);
      ctx.beginPath();
      ctx.moveTo(-halfWidth * 0.65, 0);
      ctx.lineTo(halfWidth * 0.65, 0);
      ctx.lineTo(halfWidth * 0.55, teethHeight);
      ctx.lineTo(-halfWidth * 0.55, teethHeight);
      ctx.closePath();
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    }

    // 3. Tongue
    if (open > 0.35) {
      ctx.beginPath();
      ctx.ellipse(0, maxDrop * 0.85, halfWidth * 0.5, maxDrop * 0.3, 0, 0, Math.PI);
      ctx.fillStyle = '#e11d48';
      ctx.fill();
    }

    // 4. Upper Lip
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    ctx.quadraticCurveTo(-halfWidth * 0.4, -lipThickness - 1, 0, -lipThickness);
    ctx.quadraticCurveTo(halfWidth * 0.4, -lipThickness - 1, halfWidth, 0);
    ctx.quadraticCurveTo(halfWidth * 0.4, -maxDrop * 0.25, 0, -maxDrop * 0.15);
    ctx.quadraticCurveTo(-halfWidth * 0.4, -maxDrop * 0.25, -halfWidth, 0);
    ctx.closePath();
    ctx.fillStyle = lipColor;
    ctx.fill();

    // 5. Lower Lip
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    ctx.quadraticCurveTo(0, maxDrop * 1.3 + 3, halfWidth, 0);
    ctx.quadraticCurveTo(0, maxDrop * 1.3 + 3 + lipThickness + 1.5, -halfWidth, 0);
    ctx.closePath();
    ctx.fillStyle = lipColor;
    ctx.fill();

    // Corner crease shadows
    ctx.beginPath();
    ctx.arc(-halfWidth, 0, 1.5, 0, Math.PI * 2);
    ctx.arc(halfWidth, 0, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = lipShade;
    ctx.fill();
  }

  ctx.restore();
}

function drawHair(ctx: CanvasRenderingContext2D, style: string) {
  ctx.save();

  if (style === 'marco') {
    // Classic European side-parted dark hair
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.moveTo(-52, -20);
    ctx.bezierCurveTo(-54, -75, -20, -92, 10, -90);
    ctx.bezierCurveTo(45, -88, 54, -65, 52, -20);
    ctx.bezierCurveTo(48, -45, 30, -55, 10, -60);
    ctx.bezierCurveTo(-15, -65, -42, -50, -52, -20);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'elena') {
    // Elegant warm brown styled bob with gentle volume
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.moveTo(-56, 30);
    ctx.bezierCurveTo(-65, -40, -50, -95, 0, -95);
    ctx.bezierCurveTo(50, -95, 65, -40, 56, 30);
    ctx.bezierCurveTo(48, 10, 48, -40, 36, -55);
    ctx.bezierCurveTo(0, -65, -30, -60, -48, -40);
    ctx.bezierCurveTo(-48, 10, -50, 20, -56, 30);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'kenji') {
    // Sharp modern textured fade
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(-50, -18);
    ctx.bezierCurveTo(-52, -80, -10, -96, 20, -92);
    ctx.bezierCurveTo(50, -88, 54, -70, 50, -18);
    ctx.lineTo(44, -30);
    ctx.bezierCurveTo(20, -70, -20, -65, -44, -30);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'svetlana') {
    // Blonde professional styled hair
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath();
    ctx.moveTo(-55, 25);
    ctx.bezierCurveTo(-64, -35, -45, -94, 0, -94);
    ctx.bezierCurveTo(45, -94, 64, -35, 55, 25);
    ctx.bezierCurveTo(46, -10, 42, -45, 30, -60);
    ctx.bezierCurveTo(0, -68, -25, -62, -44, -45);
    ctx.bezierCurveTo(-46, -10, -50, 10, -55, 25);
    ctx.closePath();
    ctx.fill();
  } else {
    // Amira: Long dark waves
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.moveTo(-58, 45);
    ctx.bezierCurveTo(-66, -30, -45, -95, 0, -95);
    ctx.bezierCurveTo(45, -95, 66, -30, 58, 45);
    ctx.bezierCurveTo(50, 10, 48, -45, 35, -60);
    ctx.bezierCurveTo(0, -68, -30, -62, -48, -45);
    ctx.bezierCurveTo(-48, 10, -52, 25, -58, 45);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawCustomPhotoAnchor(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  anchor: AnchorProfile,
  metrics: VisemeMetrics,
  _anim: AvatarAnimState
) {
  // Safe image dimension retrieval to avoid NaN
  const nw = img.naturalWidth || img.width || 480;
  const nh = img.naturalHeight || img.height || 560;
  const targetW = 480;
  const targetH = Math.min(720, Math.max(340, (nh / nw) * targetW));
  const drawX = -targetW / 2;
  const drawY = -targetH / 2 + 30;

  // Outer broadcast portrait shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(drawX, drawY, targetW, targetH, 24);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Draw portrait image clipped
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(drawX, drawY, targetW, targetH, 24);
  ctx.clip();
  try {
    ctx.drawImage(img, drawX, drawY, targetW, targetH);
  } catch (err) {
    console.warn('Errore drawImage foto conduttore:', err);
  }
  ctx.restore();

  // Subtle studio rim highlight
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(drawX, drawY, targetW, targetH, 24);
  ctx.stroke();
  ctx.restore();

  // Overlay calibrated mouth with lip sync
  const pos = anchor.mouthPosition || { x: 0, y: 35, scale: 1.1 };
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.scale(pos.scale, pos.scale);
  drawLipSyncMouth(ctx, 0, 0, metrics, 'marco');
  ctx.restore();
}

function drawCustomPhotoPlaceholder(
  ctx: CanvasRenderingContext2D,
  anchor: AnchorProfile
) {
  const targetW = 480;
  const targetH = 640;
  const drawX = -targetW / 2;
  const drawY = -targetH / 2 + 30;

  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(drawX, drawY, targetW, targetH, 24);
  ctx.fill();

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Silhouette / Camera prompt
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('FOTO CONDUTTORE', 0, -20);

  ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(anchor.name || 'Personalizzato', 0, 15);
  ctx.fillText('Carica la tua immagine nella scheda Conduttore', 0, 45);

  ctx.restore();
}

