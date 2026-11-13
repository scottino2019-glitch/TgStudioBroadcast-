export interface RecordingResult {
  blob: Blob;
  url: string;
  durationSec: number;
  format: string;
  sizeBytes: number;
}

export class VideoRecorderManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private startTime = 0;
  private timerInterval: number | null = null;
  private isRecording = false;

  public startRecording(
    canvas: HTMLCanvasElement,
    audioStream: MediaStream | null,
    onTick?: (seconds: number) => void
  ): boolean {
    if (this.isRecording) return false;

    try {
      this.recordedChunks = [];
      const canvasStream = canvas.captureStream(30);

      // Create composite stream combining canvas video and Web Audio
      const combinedStream = new MediaStream();

      // Add video tracks
      canvasStream.getVideoTracks().forEach((track) => {
        combinedStream.addTrack(track);
      });

      // Add audio tracks if available
      if (audioStream) {
        audioStream.getAudioTracks().forEach((track) => {
          combinedStream.addTrack(track);
        });
      }

      // Check supported MIME types
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4';
      }

      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 10_000_000, // 10 Mbps for crisp 1080p scrolling ticker & graphics
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.startTime = performance.now();
      this.isRecording = true;

      if (onTick) {
        this.timerInterval = window.setInterval(() => {
          const elapsed = (performance.now() - this.startTime) / 1000;
          onTick(elapsed);
        }, 200);
      }

      this.mediaRecorder.start(500); // collect 500ms chunks for smoother bitrate allocation
      return true;
    } catch (err) {
      console.error('Impossibile avviare la registrazione video:', err);
      this.isRecording = false;
      return false;
    }
  }

  public stopRecording(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        return reject(new Error('Nessuna registrazione in corso.'));
      }

      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      const durationSec = Math.max(1, (performance.now() - this.startTime) / 1000);
      const mime = this.mediaRecorder.mimeType || 'video/webm';

      this.mediaRecorder.onstop = () => {
        const finalBlob = new Blob(this.recordedChunks, { type: mime });
        const videoUrl = URL.createObjectURL(finalBlob);

        this.isRecording = false;
        this.mediaRecorder = null;

        resolve({
          blob: finalBlob,
          url: videoUrl,
          durationSec: Math.round(durationSec * 10) / 10,
          format: mime.includes('mp4') ? 'mp4' : 'webm',
          sizeBytes: finalBlob.size,
        });
      };

      this.mediaRecorder.stop();
    });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}

export const globalVideoRecorder = new VideoRecorderManager();
