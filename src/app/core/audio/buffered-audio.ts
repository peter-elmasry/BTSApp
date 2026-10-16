import { AUDIO_CUES, type AudioCue } from './audio-types';

interface PendingSound {
  cue: AudioCue;
  allowed: () => boolean;
  started: () => void;
  discarded: () => void;
}
/** No audio context or asset request is created until enable() runs in a user gesture. */
export class BufferedAudio {
  private context?: AudioContext;
  private gain?: GainNode;
  private readonly buffers = new Map<AudioCue, AudioBuffer>();
  private queue: PendingSound[] = [];
  private current?: { source: AudioBufferSourceNode; cue: AudioCue };
  private volume = 0.7;
  private preparing = false;
  constructor(private readonly state: (running: boolean) => void) {}
  get running() {
    return this.context?.state === 'running';
  }
  async enable(): Promise<AudioCue[]> {
    if (!this.context || this.context.state === 'closed') {
      const factory =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!factory) throw new Error('AUDIO_UNAVAILABLE');
      this.context = new factory();
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
      this.context.onstatechange = () => this.state(this.running);
    }
    const context = this.context;
    this.preparing = true;
    try {
      // This call precedes every await, preserving the activation gesture on mobile browsers.
      const resumed = context.resume();
      this.gain!.gain.value = this.volume;
      await resumed;
      this.state(this.running);
      if (!this.running) throw new Error('AUDIO_BLOCKED');
      await Promise.allSettled(
        AUDIO_CUES.map(async (cue) => {
          if (this.buffers.has(cue)) return;
          for (let attempt = 0; attempt < 2; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            try {
              const response = await fetch(`/sounds/${cue}.mp3`, { signal: controller.signal });
              if (!response.ok) throw new Error('MISSING_AUDIO');
              const buffer = await context.decodeAudioData(await response.arrayBuffer());
              if (!buffer.duration) throw new Error('INVALID_AUDIO');
              this.buffers.set(cue, buffer);
              return;
            } catch (error) {
              if (attempt === 1) throw error;
              await new Promise((resolve) => setTimeout(resolve, 250));
            } finally {
              clearTimeout(timeout);
            }
          }
        }),
      );
      return AUDIO_CUES.filter((cue) => !this.buffers.has(cue));
    } finally {
      this.preparing = false;
      this.pump();
    }
  }
  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.gain) this.gain.gain.value = this.volume;
  }
  enqueue(cue: AudioCue, allowed: () => boolean, started = () => {}, discarded = () => {}) {
    if (!this.running || (!this.preparing && !this.buffers.has(cue)) || !allowed()) return false;
    const round = cue.startsWith('round-');
    if (round) {
      this.queue = this.queue.filter((item) => {
        if (item.cue.startsWith('round-')) return true;
        item.discarded();
        return false;
      });
      if (this.current && !this.current.cue.startsWith('round-')) this.stopCurrent();
    }
    if (this.queue.length >= 8) return false;
    this.queue.push({ cue, allowed, started, discarded });
    this.pump();
    return true;
  }
  private pump() {
    if (this.preparing || this.current || !this.running) return;
    while (this.queue.length) {
      const item = this.queue.shift()!;
      const buffer = this.buffers.get(item.cue);
      if (!buffer || !item.allowed()) {
        item.discarded();
        continue;
      }
      const source = this.context!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain!);
      this.current = { source, cue: item.cue };
      source.onended = () => {
        source.disconnect();
        if (this.current?.source === source) {
          this.current = undefined;
          this.pump();
        }
      };
      try {
        source.start(0, 0, Math.min(buffer.duration, 4));
        item.started();
      } catch {
        this.stopCurrent();
        item.discarded();
        this.state(false);
      }
      return;
    }
  }
  private stopCurrent() {
    const current = this.current;
    this.current = undefined;
    if (current) {
      current.source.onended = null;
      try {
        current.source.stop();
      } catch {
        /* Already ended. */
      }
      current.source.disconnect();
    }
  }
  clear() {
    this.queue.forEach((item) => item.discarded());
    this.queue = [];
    this.stopCurrent();
  }
  mute() {
    this.clear();
    if (this.gain) this.gain.gain.value = 0;
    void this.context?.suspend().catch(() => {});
  }
  destroy() {
    this.clear();
    void this.context?.close().catch(() => {});
  }
}
