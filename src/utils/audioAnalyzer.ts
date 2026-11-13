import { VisemeMetrics } from '../types';

export class AudioLipSyncEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private playbackGain: GainNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private animationId: number | null = null;
  private chunkSafetyTimer: number | null = null;
  private isPlaying = false;
  private onMetricsUpdate: ((metrics: VisemeMetrics) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;

  // Smoothed internal metrics
  private smoothedOpenness = 0;
  private smoothedWidth = 0.5;
  private smoothedTeeth = 0;
  private smoothedVolume = 0;

  private keepAliveStarted = false;
  private playbackSessionId = 0;

  private initContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    return this.audioCtx;
  }

  private ensureRoutingNodes(ctx: AudioContext): {
    gain: GainNode;
    dest: MediaStreamAudioDestinationNode;
  } {
    if (!this.mediaStreamDest) {
      this.mediaStreamDest = ctx.createMediaStreamDestination();
    }
    if (!this.playbackGain) {
      this.playbackGain = ctx.createGain();
      this.playbackGain.gain.value = 1.0;
      this.playbackGain.connect(ctx.destination);
      this.playbackGain.connect(this.mediaStreamDest);
    }
    if (!this.keepAliveStarted) {
      // Pump an ultra-quiet (-90dB) carrier into mediaStreamDest ONLY (never speakers)
      // so Chromium/Android/Safari MediaRecorder Opus/AAC muxers never drop the audio track
      // during silent intervals or end-credits slate.
      const osc = ctx.createOscillator();
      osc.frequency.value = 20;
      const carrierGain = ctx.createGain();
      carrierGain.gain.value = 0.00003;
      osc.connect(carrierGain);
      carrierGain.connect(this.mediaStreamDest);
      osc.start();
      this.keepAliveStarted = true;
    }
    return { gain: this.playbackGain, dest: this.mediaStreamDest };
  }

  public unlockAudio(): void {
    try {
      const ctx = this.initContext();
      this.ensureRoutingNodes(ctx);
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore if AudioContext unavailable
    }
  }

  public async ensureAudioReady(): Promise<MediaStream | null> {
    try {
      const ctx = this.initContext();
      const { dest } = this.ensureRoutingNodes(ctx);
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      return dest.stream;
    } catch (err) {
      console.warn('MediaStream audio non disponibile:', err);
      return null;
    }
  }

  public getAudioStream(): MediaStream | null {
    try {
      const ctx = this.initContext();
      const { dest } = this.ensureRoutingNodes(ctx);
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      return dest.stream;
    } catch (err) {
      console.warn('MediaStream audio non disponibile:', err);
      return null;
    }
  }

  private decodeBase64ToArrayBuffer(base64Data: string): ArrayBuffer {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Decodes base64 audio chunks into AudioBuffers upfront so recording can begin
   * at the exact millisecond audio playback starts (no silent fetch delay in video).
   */
  public async decodeAudioChunksBase64(base64Chunks: string[]): Promise<AudioBuffer[]> {
    const ctx = this.initContext();
    this.ensureRoutingNodes(ctx);
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Continue; decoding works even before resume completes
      }
    }

    const buffers: AudioBuffer[] = [];
    for (const chunk of base64Chunks) {
      const arrBuf = this.decodeBase64ToArrayBuffer(chunk);
      const audioBuffer = await ctx.decodeAudioData(arrBuf);
      buffers.push(audioBuffer);
    }
    return buffers;
  }

  public async playAudioBuffers(
    buffers: AudioBuffer[],
    onFrame: (metrics: VisemeMetrics) => void,
    onEnded?: () => void
  ): Promise<void> {
    this.stop();
    if (!buffers || buffers.length === 0) {
      onEnded?.();
      return;
    }

    const sessionId = ++this.playbackSessionId;
    const ctx = this.initContext();
    const { gain } = this.ensureRoutingNodes(ctx);

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Continue
      }
    }
    if (sessionId !== this.playbackSessionId) return;

    this.onMetricsUpdate = onFrame;
    this.onEndedCallback = onEnded || null;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    this.analyser = analyser;

    this.isPlaying = true;
    this.startAnalysisLoop();

    let finished = false;
    const finishOnce = () => {
      if (finished || sessionId !== this.playbackSessionId) return;
      finished = true;
      this.stop();
      onEnded?.();
    };

    const playIndex = (idx: number) => {
      if (sessionId !== this.playbackSessionId) return;
      if (idx >= buffers.length) {
        finishOnce();
        return;
      }

      if (this.chunkSafetyTimer !== null) {
        window.clearTimeout(this.chunkSafetyTimer);
        this.chunkSafetyTimer = null;
      }

      const audioBuffer = buffers[idx];
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      // Route directly to playbackGain (speakers + MediaRecorder) AND in parallel to analyser
      source.connect(gain);
      source.connect(analyser);
      this.currentSource = source;

      let advanced = false;
      const advance = () => {
        if (advanced || sessionId !== this.playbackSessionId) return;
        advanced = true;
        if (this.chunkSafetyTimer !== null) {
          window.clearTimeout(this.chunkSafetyTimer);
          this.chunkSafetyTimer = null;
        }
        this.currentSource = null;
        try {
          source.disconnect();
        } catch {
          // Ignore
        }
        if (idx + 1 < buffers.length) {
          playIndex(idx + 1);
        } else {
          finishOnce();
        }
      };

      source.onended = advance;
      // Safety watchdog in case browser misses onended during background/load spikes
      const timeoutMs = Math.max(1500, Math.ceil(audioBuffer.duration * 1000) + 1200);
      this.chunkSafetyTimer = window.setTimeout(advance, timeoutMs);

      try {
        source.start(0);
      } catch (startErr) {
        console.warn('Errore avvio sorgente audio:', startErr);
        advance();
      }
    };

    playIndex(0);
  }

  public async playAudioChunksBase64(
    base64Chunks: string[],
    onFrame: (metrics: VisemeMetrics) => void,
    onEnded?: () => void
  ): Promise<void> {
    if (!base64Chunks || base64Chunks.length === 0) {
      onEnded?.();
      return;
    }
    const buffers = await this.decodeAudioChunksBase64(base64Chunks);
    await this.playAudioBuffers(buffers, onFrame, onEnded);
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
      const pauseModulation = Math.sin(t * 1.5) > -0.6 ? 1 : 0.15;

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

      let rmsSum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (timeDomainData[i] - 128) / 128;
        rmsSum += val * val;
      }
      const rawVolume = Math.min(1, Math.sqrt(rmsSum / bufferLength) * 3.5);

      const lowMidEnergy = getBandAverage(300, 950);
      const midEnergy = getBandAverage(1000, 2600);
      const highEnergy = getBandAverage(3000, 7500);

      let targetOpenness = 0;
      let targetWidth = 0.5;
      let targetTeeth = 0;

      if (rawVolume > 0.03) {
        targetOpenness = Math.min(1, (lowMidEnergy * 1.5 + rawVolume * 0.8) * 1.2);
        targetWidth = Math.min(1, Math.max(0, 0.35 + (midEnergy - lowMidEnergy * 0.5) * 1.2));
        if (highEnergy > 0.15 || (targetOpenness > 0.25 && targetOpenness < 0.65)) {
          targetTeeth = Math.min(1, highEnergy * 2.2);
        }
      }

      const openCoeff = targetOpenness > this.smoothedOpenness ? 0.45 : 0.25;
      this.smoothedOpenness += (targetOpenness - this.smoothedOpenness) * openCoeff;
      this.smoothedWidth += (targetWidth - this.smoothedWidth) * 0.3;
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
    this.playbackSessionId += 1;
    this.isPlaying = false;
    if (this.chunkSafetyTimer !== null) {
      window.clearTimeout(this.chunkSafetyTimer);
      this.chunkSafetyTimer = null;
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // Ignore already stopped sources
      }
      this.currentSource = null;
    }

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
