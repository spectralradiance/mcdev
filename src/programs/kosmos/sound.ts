// A small Web Audio synth: every traced operation can become a short blip whose pitch follows the
// value involved. Notes are spread across the frame they were played in and capped in number, so a
// thousand operations per frame becomes a dense chirp rather than a wall of clipping.

export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type Scale = 'continuous' | 'pentatonic' | 'major' | 'minor' | 'chromatic';

export type SoundSettings = { enabled: boolean; volume: number; wave: Waveform; scale: Scale; low: number; octaves: number };

export const DEFAULT_SOUND: SoundSettings = { enabled: true, volume: 0.35, wave: 'triangle', scale: 'continuous', low: 110, octaves: 4 };

export const SCALES: Record<Exclude<Scale, 'continuous'>, number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** Map t in [0, 1] to a frequency over the configured range, snapped to the scale if there is one. */
export function frequency(t: number, s: Pick<SoundSettings, 'scale' | 'low' | 'octaves'>) {
  t = Math.min(1, Math.max(0, t));
  if (s.scale === 'continuous') return s.low * 2 ** (t * s.octaves);
  const steps = SCALES[s.scale];
  const k = Math.round(t * steps.length * s.octaves);
  const octave = Math.floor(k / steps.length), degree = k % steps.length;
  return s.low * 2 ** (octave + steps[degree] / 12);
}

export type Note = { t: number; pan?: number; gain?: number; wave?: Waveform; length?: number; detune?: number };

class SoundEngine {
  settings: SoundSettings = { ...DEFAULT_SOUND };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active = 0;
  private lastFrame = 0;

  /** Create or resume the context; must first be called from a user gesture. */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyVolume();
  }

  applyVolume() {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.settings.enabled ? this.settings.volume : 0, this.ctx.currentTime, 0.02);
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running' && this.settings.enabled; }

  /** Play up to `max` notes, spread over the next frame. */
  play(notes: Note[], max = 4) {
    if (!this.ready || !notes.length) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const frame = Math.min(0.05, Math.max(0.012, now - this.lastFrame));
    this.lastFrame = now;
    // Thin evenly rather than taking the first few, so a long frame still sounds like its whole span.
    const picked = notes.length <= max ? notes : Array.from({ length: max }, (_, k) => notes[Math.floor(((k + 0.5) * notes.length) / max)]);
    picked.forEach((note, k) => this.voice(note, now + 0.005 + (frame * k) / picked.length));
  }

  private voice(note: Note, when: number) {
    if (this.active > 32) return;
    const ctx = this.ctx!, s = this.settings;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    osc.type = note.wave ?? s.wave;
    osc.frequency.value = frequency(note.t, s);
    if (note.detune) osc.detune.value = note.detune;
    const length = note.length ?? 0.08;
    // Square and saw are much louder than sine for the same amplitude.
    const loudness = (note.gain ?? 1) * (osc.type === 'square' || osc.type === 'sawtooth' ? 0.12 : 0.25);
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(loudness, when + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);
    osc.connect(env);
    if (pan) { pan.pan.value = note.pan ?? 0; env.connect(pan).connect(this.master!); } else env.connect(this.master!);
    osc.start(when);
    osc.stop(when + length + 0.02);
    this.active++;
    osc.onended = () => { this.active--; osc.disconnect(); env.disconnect(); pan?.disconnect(); };
  }

  /** A short arpeggio, for finds and finishes. */
  chord(ts: number[], gap = 0.06, wave: Waveform = 'sine') {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    ts.forEach((t, k) => this.voice({ t, wave, length: 0.5, gain: 0.8 }, now + 0.01 + k * gap));
  }
}

export const sound = new SoundEngine();
