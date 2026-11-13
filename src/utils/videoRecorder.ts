export interface RecordingResult {
  blob: Blob;
  url: string;
  durationSec: number;
  format: string;
  sizeBytes: number;
  hasAudio: boolean;
}

export class VideoRecorderManager {
  private mediaRecorder: MediaRecorder | null = null;
  private canvasStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private startTime = 0;
  private timerInterval: number | null = null;
  private isRecording = false;
  private hasAudioTrack = false;

  private createRecorderWithFallbacks(
    canvasStream: MediaStream,
    audioStream: MediaStream | null,
    hasRealAudio: boolean
  ): { recorder: MediaRecorder; hasAudio: boolean } {
    const combinedStream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => {
      combinedStream.addTrack(track);
    });

    let addedAudioTrack = false;
    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => {
        if (track.readyState === 'live') {
          combinedStream.addTrack(track);
          addedAudioTrack = true;
        }
      });
    }

    const candidateMimeTypes = addedAudioTrack
      ? [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9,opus',
          'video/webm',
        ]
      : [
          'video/mp4;codecs=avc1.42E01E',
          'video/mp4',
          'video/webm;codecs=vp8',
          'video/webm;codecs=vp9',
          'video/webm',
        ];

    const supportedMime =
      typeof MediaRecorder.isTypeSupported === 'function'
        ? candidateMimeTypes.find((m) => MediaRecorder.isTypeSupported(m))
        : undefined;

    const effectiveHasAudio = addedAudioTrack && hasRealAudio;

    if (supportedMime) {
      try {
        return {
          recorder: new MediaRecorder(combinedStream, {
            mimeType: supportedMime,
            videoBitsPerSecond: 2_800_000,
            ...(addedAudioTrack ? { audioBitsPerSecond: 128_000 } : {}),
          }),
          hasAudio: effectiveHasAudio,
        };
      } catch {
        try {
          return {
            recorder: new MediaRecorder(combinedStream, { mimeType: supportedMime }),
            hasAudio: effectiveHasAudio,
          };
        } catch {
          // Continue to fallbacks
        }
      }
    }

    try {
      return {
        recorder: new MediaRecorder(combinedStream),
        hasAudio: effectiveHasAudio,
      };
    } catch {
      return {
        recorder: new MediaRecorder(canvasStream),
        hasAudio: false,
      };
    }
  }

  public startRecording(
    canvas: HTMLCanvasElement,
    audioStream: MediaStream | null,
    onTick?: (seconds: number) => void,
    hasRealAudio = true
  ): boolean {
    if (this.isRecording) return false;

    try {
      this.recordedChunks = [];
      const canvasStream = canvas.captureStream(30);
      this.canvasStream = canvasStream;

      const { recorder, hasAudio } = this.createRecorderWithFallbacks(
        canvasStream,
        audioStream,
        hasRealAudio
      );
      this.mediaRecorder = recorder;
      this.hasAudioTrack = hasAudio;

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

      recorder.start(250);
      return true;
    } catch (err) {
      console.error('Impossibile avviare la registrazione video:', err);
      this.cleanupCanvasStream();
      this.isRecording = false;
      this.mediaRecorder = null;
      this.hasAudioTrack = false;
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
      const chunkMime = this.recordedChunks.find((c) => c.type)?.type;
      const mime = recorder.mimeType || chunkMime || 'video/webm';
      const hadAudio = this.hasAudioTrack;

      const finalizeResult = () => {
        const finalBlob = new Blob(this.recordedChunks, { type: mime });
        this.recordedChunks = [];
        this.cleanupCanvasStream();
        this.isRecording = false;
        this.mediaRecorder = null;
        this.hasAudioTrack = false;

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
          hasAudio: hadAudio,
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
          this.recordedChunks = [];
          this.cleanupCanvasStream();
          this.isRecording = false;
          this.mediaRecorder = null;
          this.hasAudioTrack = false;
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
