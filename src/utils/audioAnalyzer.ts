import { VisemeMetrics } from '../types';

export class AudioLipSyncEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | HTMLAudioElement | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private animationId: number | null = null;
  private isPlaying = false;
  private onMetricsUpdate: ((metrics: VisemeMetrics) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;

  // Smoothed internal metrics
  private smoothedOpenness = 0;
  private smoothedWidth = 0.5;
  private smoothedTeeth = 0;
  private smoothedVolume = 0;

  constructor() {
    // AudioContext is initialized on first user interaction to comply with browser autoplay policies
  }

  private initContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public getAudioStream(): MediaStream | null {
    if (!this.mediaStreamDest) {
      const ctx = this.initContext();
      this.mediaStreamDest = ctx.createMediaStreamDestination();
    }
    return this.mediaStreamDest.stream;
  }

  public async playBase64Wav(
    base64Data: string,
    onFrame: (metrics: VisemeMetrics) => void,
    onEnded?: () => void
  ): Promise<void> {
    this.stop();
    const ctx = this.initContext();
    this.onMetricsUpdate = onFrame;
    this.onEndedCallback = onEnded || null;

    // Convert base64 to ArrayBuffer
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    try {
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;

      // Connect source to analyser
      source.connect(analyser);

      // Connect analyser to speakers
      analyser.connect(ctx.destination);

      // Also connect to MediaStreamDestination for video recording
      if (!this.mediaStreamDest) {
        this.mediaStreamDest = ctx.createMediaStreamDestination();
      }
      analyser.connect(this.mediaStreamDest);

      this.currentSource = source;
      this.analyser = analyser;
      this.isPlaying = true;

      source.onended = () => {
        this.stop();
        if (this.onEndedCallback) {
          this.onEndedCallback();
        }
      };

      source.start(0);
      this.startAnalysisLoop();
    } catch (err) {
      console.error('Errore decodifica buffer audio WAV:', err);
      throw err;
    }
  }

  // Fallback simulator for Web Speech API or test preview
  public startSpeechSimulation(
    estimatedDurationSec: number,
    onFrame: (metrics: VisemeMetrics) => void,
    onEnded?: () => void
  ) {
    this.stop();
    this.isPlaying = true;
    this.onMetricsUpdate = onFrame;
    this.onEndedCallback = onEnded || null;

    const startTime = performance.now();
    const totalDurationMs = estimatedDurationSec * 1000;

    const step = () => {
      if (!this.isPlaying) return;

      const elapsed = performance.now() - startTime;
      if (elapsed >= totalDurationMs) {
        this.stop();
        if (this.onEndedCallback) this.onEndedCallback();
        return;
      }

      // Procedural natural speech rhythms (syllables ~ 4Hz - 6Hz)
      const t = elapsed / 1000;
      const syllableWave = Math.sin(t * 14) * 0.4 + Math.sin(t * 22) * 0.3 + Math.sin(t * 7) * 0.3;
      const pauseModulation = Math.sin(t * 1.5) > -0.6 ? 1 : 0.15; // natural phrase pauses

      const rawOpen = Math.max(0, Math.min(1, (syllableWave * 0.7 + 0.3) * pauseModulation));
      const rawWidth = 0.4 + Math.sin(t * 9) * 0.3;
      const rawTeeth = rawOpen > 0.3 && Math.sin(t * 18) > 0.2 ? 0.6 : 0.1;

      this.smoothedOpenness += (rawOpen - this.smoothedOpenness) * 0.35;
      this.smoothedWidth += (rawWidth - this.smoothedWidth) * 0.25;
      this.smoothedTeeth += (rawTeeth - this.smoothedTeeth) * 0.3;
      this.smoothedVolume = rawOpen;

      if (this.onMetricsUpdate) {
        this.onMetricsUpdate({
          openness: this.smoothedOpenness,
          width: this.smoothedWidth,
          teeth: this.smoothedTeeth,
          volume: this.smoothedVolume,
          isSpeaking: this.smoothedOpenness > 0.08,
        });
      }

      this.animationId = requestAnimationFrame(step);
    };

    this.animationId = requestAnimationFrame(step);
  }

  private startAnalysisLoop() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const frequencyData = new Uint8Array(bufferLength);
    const timeDomainData = new Uint8Array(bufferLength);

    const sampleRate = this.audioCtx ? this.audioCtx.sampleRate : 44100;
    const binHz = sampleRate / this.analyser.fftSize;

    // Define formant frequency bands
    const getBandAverage = (startHz: number, endHz: number) => {
      const startBin = Math.max(0, Math.floor(startHz / binHz));
      const endBin = Math.min(bufferLength - 1, Math.ceil(endHz / binHz));
      if (startBin >= endBin) return frequencyData[startBin] / 255;
      let sum = 0;
      for (let i = startBin; i <= endBin; i++) {
        sum += frequencyData[i];
      }
      return sum / (endBin - startBin + 1) / 255;
    };

    const analyze = () => {
      if (!this.isPlaying || !this.analyser) return;

      this.analyser.getByteFrequencyData(frequencyData);
      this.analyser.getByteTimeDomainData(timeDomainData);

      // RMS calculation for overall volume
      let rmsSum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (timeDomainData[i] - 128) / 128;
        rmsSum += val * val;
      }
      const rawVolume = Math.min(1, Math.sqrt(rmsSum / bufferLength) * 3.5);

      // Formant analysis
      // F1 (300Hz - 900Hz): indicates jaw drop & vowel openness (e.g. "a", "o")
      const lowMidEnergy = getBandAverage(300, 950);
      // F2 (1000Hz - 2500Hz): indicates tongue elevation and lip stretch (e.g. "ee", "i")
      const midEnergy = getBandAverage(1000, 2600);
      // High Frequencies (3000Hz - 7000Hz): sibilants / fricatives (e.g. "s", "f", "z", "th")
      const highEnergy = getBandAverage(3000, 7500);

      // Target viseme calculations
      let targetOpenness = 0;
      let targetWidth = 0.5;
      let targetTeeth = 0;

      if (rawVolume > 0.03) {
        // Voice is actively producing sound
        // Scale openness based on combined energy and F1
        targetOpenness = Math.min(1, (lowMidEnergy * 1.5 + rawVolume * 0.8) * 1.2);

        // Width: high mid energy expands the mouth horizontally (smiling "ee" sound)
        targetWidth = Math.min(1, Math.max(0, 0.35 + (midEnergy - lowMidEnergy * 0.5) * 1.2));

        // Teeth: prominent during high frequency fricatives
        if (highEnergy > 0.15 || (targetOpenness > 0.25 && targetOpenness < 0.65)) {
          targetTeeth = Math.min(1, highEnergy * 2.2);
        }
      }

      // Asymmetric smoothing: fast attack (speaking onset), natural decay
      const attack = 0.45;
      const decay = 0.25;

      const openCoeff = targetOpenness > this.smoothedOpenness ? attack : decay;
      this.smoothedOpenness += (targetOpenness - this.smoothedOpenness) * openCoeff;

      const widthCoeff = 0.3;
      this.smoothedWidth += (targetWidth - this.smoothedWidth) * widthCoeff;

      const teethCoeff = targetTeeth > this.smoothedTeeth ? 0.4 : 0.25;
      this.smoothedTeeth += (targetTeeth - this.smoothedTeeth) * teethCoeff;

      this.smoothedVolume += (rawVolume - this.smoothedVolume) * 0.35;

      const isSpeaking = this.smoothedOpenness > 0.05 || this.smoothedVolume > 0.05;

      if (this.onMetricsUpdate) {
        this.onMetricsUpdate({
          openness: this.smoothedOpenness,
          width: this.smoothedWidth,
          teeth: this.smoothedTeeth,
          volume: this.smoothedVolume,
          isSpeaking,
        });
      }

      this.animationId = requestAnimationFrame(analyze);
    };

    this.animationId = requestAnimationFrame(analyze);
  }

  public stop() {
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.currentSource) {
      try {
        (this.currentSource as any).stop?.();
        (this.currentSource as any).disconnect?.();
      } catch {
        // Ignore already stopped sources
      }
      this.currentSource = null;
    }

    // Reset smoothly to resting face
    this.smoothedOpenness = 0;
    this.smoothedWidth = 0.5;
    this.smoothedTeeth = 0;
    this.smoothedVolume = 0;

    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({
        openness: 0,
        width: 0.5,
        teeth: 0,
        volume: 0,
        isSpeaking: false,
      });
    }
  }

  public getCurrentMetrics(): VisemeMetrics {
    return {
      openness: this.smoothedOpenness,
      width: this.smoothedWidth,
      teeth: this.smoothedTeeth,
      volume: this.smoothedVolume,
      isSpeaking: this.smoothedOpenness > 0.05 || this.smoothedVolume > 0.05,
    };
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const globalAudioEngine = new AudioLipSyncEngine();
