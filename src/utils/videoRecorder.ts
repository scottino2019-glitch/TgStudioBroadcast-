export interface RecordingResult {
  blob: Blob;
  url: string;
  durationSec: number;
  format: string;
  sizeBytes: number;
}

export class VideoRecorderManager {
  private mediaRecorder: MediaRecorder | null = null;
  private canvasStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private startTime = 0;
  private timerInterval: number | null = null;
  private isRecording = false;

  private createRecorderWithFallbacks(
    canvasStream: MediaStream,
    audioStream: MediaStream | null
  ): MediaRecorder {
    const combinedStream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => {
      combinedStream.addTrack(track);
    });
    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => {
        if (track.readyState === 'live') {
          combinedStream.addTrack(track);
        }
      });
    }

    const candidateMimeTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
      'video/mp4',
    ];

    const supportedMime =
      typeof MediaRecorder.isTypeSupported === 'function'
        ? candidateMimeTypes.find((m) => MediaRecorder.isTypeSupported(m))
        : undefined;

    // 1. Try preferred codec + 5 Mbps bitrate on combined stream (crisp 1080p without CPU bottleneck)
    if (supportedMime) {
      try {
        return new MediaRecorder(combinedStream, {
          mimeType: supportedMime,
          videoBitsPerSecond: 5_000_000,
        });
      } catch {
        // Try without bitrate hint
        try {
          return new MediaRecorder(combinedStream, { mimeType: supportedMime });
        } catch {
          // Continue to fallbacks
        }
      }
    }

    // 2. Try browser default MediaRecorder on combined stream
    try {
      return new MediaRecorder(combinedStream);
    } catch {
      // 3. Last resort: video-only canvasStream (never drop recording if audio muxing fails)
      return new MediaRecorder(canvasStream);
    }
  }

  public startRecording(
    canvas: HTMLCanvasElement,
    audioStream: MediaStream | null,
    onTick?: (seconds: number) => void
  ): boolean {
    if (this.isRecording) return false;

    try {
      this.recordedChunks = [];
      const canvasStream = canvas.captureStream(30);
      this.canvasStream = canvasStream;

      const recorder = this.createRecorderWithFallbacks(canvasStream, audioStream);
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      recorder.onerror = (ev) => {
        console.error('Errore interno MediaRecorder:', ev);
      };

      this.startTime = performance.now();
      this.isRecording = true;

      if (onTick) {
        this.timerInterval = window.setInterval(() => {
          const elapsed = (performance.now() - this.startTime) / 1000;
          onTick(elapsed);
        }, 200);
      }

      recorder.start(500);
      return true;
    } catch (err) {
      console.error('Impossibile avviare la registrazione video:', err);
      this.cleanupCanvasStream();
      this.isRecording = false;
      this.mediaRecorder = null;
      return false;
    }
  }

  private cleanupCanvasStream() {
    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore
        }
      });
      this.canvasStream = null;
    }
  }

  public stopRecording(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      const recorder = this.mediaRecorder;
      if (!recorder || !this.isRecording) {
        this.cleanupCanvasStream();
        return reject(new Error('Nessuna registrazione in corso.'));
      }

      const durationSec = Math.max(1, (performance.now() - this.startTime) / 1000);
      const mime = recorder.mimeType || 'video/webm';

      const finalizeResult = () => {
        const finalBlob = new Blob(this.recordedChunks, { type: mime });
        this.cleanupCanvasStream();
        this.isRecording = false;
        this.mediaRecorder = null;

        if (finalBlob.size === 0) {
          return reject(new Error('Il video registrato risulta vuoto (0 byte).'));
        }

        const videoUrl = URL.createObjectURL(finalBlob);
        resolve({
          blob: finalBlob,
          url: videoUrl,
          durationSec: Math.round(durationSec * 10) / 10,
          format: mime.includes('mp4') ? 'mp4' : 'webm',
          sizeBytes: finalBlob.size,
        });
      };

      if (recorder.state === 'inactive') {
        finalizeResult();
        return;
      }

      let settled = false;
      const safetyTimer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          finalizeResult();
        }
      }, 2500);

      recorder.onstop = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(safetyTimer);
          finalizeResult();
        }
      };

      try {
        if (typeof recorder.requestData === 'function' && recorder.state === 'recording') {
          recorder.requestData();
        }
      } catch {
        // Ignore if requestData is unsupported
      }

      try {
        recorder.stop();
      } catch (stopErr) {
        if (!settled) {
          settled = true;
          window.clearTimeout(safetyTimer);
          this.cleanupCanvasStream();
          this.isRecording = false;
          this.mediaRecorder = null;
          reject(stopErr);
        }
      }
    });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}

export const globalVideoRecorder = new VideoRecorderManager();
