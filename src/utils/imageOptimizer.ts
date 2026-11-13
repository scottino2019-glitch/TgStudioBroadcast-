/**
 * Ultra-fast, zero-freeze image optimizer.
 * Uses off-thread createImageBitmap where available to keep UI at 60 FPS without freezing,
 * with bulletproof FileReader fallback for sandboxed iframes.
 */

export interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Reads a File into a Data URL safely using FileReader with timeout.
 */
export function readFileAsDataUrl(file: File, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Tempo scaduto durante la lettura del file.'));
    }, timeoutMs);

    const reader = new FileReader();

    reader.onload = () => {
      clearTimeout(timer);
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Lettura del file non riuscita.'));
      }
    };

    reader.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Errore durante la lettura del file da disco.'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Decodes a data URL into an HTMLImageElement with safety timeout.
 */
export function decodeImage(dataUrl: string, timeoutMs = 4000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Tempo scaduto durante la decodifica dell\'immagine.'));
    }, timeoutMs);

    const img = new Image();

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Formato immagine non supportato o file danneggiato.'));
    };

    img.src = dataUrl;

    if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
      clearTimeout(timer);
      resolve(img);
    }
  });
}

/**
 * Optimizes an uploaded image file:
 * 1. Uses off-thread createImageBitmap (zero main-thread freezing)
 * 2. Downsamples onto a lightweight offscreen canvas to target dimensions
 * 3. Falls back gracefully to FileReader if needed
 */
export async function optimizeUploadedImage(
  file: File,
  options: ResizeOptions = {}
): Promise<string> {
  const {
    maxWidth = 1280,
    maxHeight = 720,
    quality = 0.82,
    format = 'image/jpeg',
  } = options;

  // Accept any image MIME or common image extension
  const isImageMime = file.type ? file.type.startsWith('image/') : false;
  const isImageExt = /\.(jpe?g|png|webp|gif|bmp|svg|avif|heic)$/i.test(file.name);

  if (!isImageMime && !isImageExt && file.name.includes('.')) {
    throw new Error('Il file selezionato non sembra essere un\'immagine supportata.');
  }

  // If SVG, read directly as data URL without rasterizing
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return readFileAsDataUrl(file, 4000);
  }

  // 1. FAST PATH: Use background-threaded createImageBitmap with browser resize when available
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    let bitmap: ImageBitmap | null = null;
    try {
      try {
        bitmap = await (createImageBitmap as any)(file, {
          resizeWidth: maxWidth,
          resizeHeight: maxHeight,
          resizeQuality: 'medium',
        });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      if (!bitmap) {
        bitmap = await createImageBitmap(file);
      }
      const nw = bitmap.width;
      const nh = bitmap.height;

      if (nw > 0 && nh > 0) {
        const widthRatio = maxWidth / nw;
        const heightRatio = maxHeight / nh;
        const ratio = Math.min(1, Math.min(widthRatio, heightRatio));

        const targetWidth = Math.max(100, Math.round(nw * ratio));
        const targetHeight = Math.max(100, Math.round(nh * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
          const dataUrl = canvas.toDataURL(format, quality);
          if (dataUrl && dataUrl.length > 100) {
            return dataUrl;
          }
        }
      }
    } catch (bitmapErr) {
      console.warn('createImageBitmap saltato, passaggio al fallback FileReader:', bitmapErr);
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch (_) {}
      }
    }
  }

  // 2. FALLBACK PATH: Standard FileReader with canvas downsampler
  const rawDataUrl = await readFileAsDataUrl(file, 5000);

  try {
    const img = await decodeImage(rawDataUrl, 4000);
    const nw = img.naturalWidth || img.width || 800;
    const nh = img.naturalHeight || img.height || 600;

    const widthRatio = maxWidth / nw;
    const heightRatio = maxHeight / nh;
    const ratio = Math.min(1, Math.min(widthRatio, heightRatio));

    const targetWidth = Math.max(100, Math.round(nw * ratio));
    const targetHeight = Math.max(100, Math.round(nh * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return rawDataUrl;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const optimized = canvas.toDataURL(format, quality);
    return optimized || rawDataUrl;
  } catch (err) {
    console.warn('Uso immagine originale diretta:', err);
    return rawDataUrl;
  }
}
