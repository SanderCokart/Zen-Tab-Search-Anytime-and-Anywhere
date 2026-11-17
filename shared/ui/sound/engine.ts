/**
 * The interface sounds: short key, latch and chime voices synthesised with the
 * Web Audio API, so there are no sample files. The voice table follows SPEC-01's
 * hardware kit (see docs/redesign/SPEC01-SOUNDS-ACCORDION.md).
 *
 * With no `AudioContext` (jsdom, an old browser) or one that throws (a CSP or
 * Permissions-Policy block), `play` does nothing. Call it only from event
 * handlers, so the lazily created context starts inside a user gesture and the
 * browser allows it to run.
 */

export const SOUND_VOICES = [
  "down",
  "down-primary",
  "up",
  "latch-down",
  "latch-up",
  "tick",
  "blip",
  "type",
  "type-space",
  "type-big",
  "type-up",
  "open",
  "mark",
  "success",
  "warning",
  "error",
] as const;

export type SoundVoice = (typeof SOUND_VOICES)[number];

/** A filtered noise burst: the click of a key or the rattle of a spring. */
export interface BurstSpec {
  filter: BiquadFilterType;
  freq: number;
  q: number;
  level: number;
  /** Seconds. */
  decay: number;
  /** Seconds after the voice starts. */
  at?: number;
}

/** An oscillator with a fast attack, an exponential decay and an optional glide. */
export interface ToneSpec {
  wave: OscillatorType;
  freq: number;
  /** Glides to this frequency over the decay. */
  to?: number;
  level: number;
  /** Seconds. */
  decay: number;
  /** Seconds; defaults to 1 ms. */
  attack?: number;
  /** Seconds after the voice starts. */
  at?: number;
}

export interface VoiceSpec {
  bursts: readonly BurstSpec[];
  tones: readonly ToneSpec[];
}

const ms = (value: number) => value / 1000;

export const VOICE_TABLE: Record<SoundVoice, VoiceSpec> = {
  down: {
    bursts: [{ filter: "bandpass", freq: 2600, q: 0.9, level: 0.32, decay: ms(22) }],
    tones: [{ wave: "sine", freq: 210, to: 130, level: 0.4, decay: ms(50) }],
  },
  "down-primary": {
    bursts: [{ filter: "bandpass", freq: 2100, q: 0.8, level: 0.36, decay: ms(26) }],
    tones: [{ wave: "sine", freq: 165, to: 100, level: 0.55, decay: ms(70) }],
  },
  up: {
    bursts: [{ filter: "bandpass", freq: 3900, q: 1.2, level: 0.26, decay: ms(14) }],
    tones: [{ wave: "sine", freq: 300, to: 240, level: 0.16, decay: ms(22) }],
  },
  "latch-down": {
    bursts: [
      { filter: "bandpass", freq: 2000, q: 0.8, level: 0.18, decay: ms(18) },
      { filter: "bandpass", freq: 1150, q: 14, level: 0.035, decay: ms(50), at: ms(4) },
    ],
    tones: [{ wave: "sine", freq: 180, to: 125, level: 0.2, decay: ms(45) }],
  },
  "latch-up": {
    bursts: [
      { filter: "bandpass", freq: 3200, q: 1, level: 0.22, decay: ms(14) },
      { filter: "bandpass", freq: 1600, q: 12, level: 0.06, decay: ms(40), at: ms(3) },
    ],
    tones: [],
  },
  tick: {
    bursts: [{ filter: "bandpass", freq: 3000, q: 0.8, level: 0.34, decay: ms(10) }],
    tones: [{ wave: "sine", freq: 2600, to: 2200, level: 0.09, decay: ms(16) }],
  },
  blip: {
    bursts: [],
    tones: [{ wave: "square", freq: 2350, level: 0.035, decay: ms(45), attack: ms(2) }],
  },
  type: {
    bursts: [{ filter: "bandpass", freq: 3300, q: 1.1, level: 0.22, decay: ms(14) }],
    tones: [{ wave: "sine", freq: 260, to: 190, level: 0.18, decay: ms(30) }],
  },
  "type-space": {
    bursts: [
      { filter: "bandpass", freq: 2200, q: 0.8, level: 0.26, decay: ms(22) },
      { filter: "bandpass", freq: 900, q: 6, level: 0.05, decay: ms(30), at: ms(6) },
    ],
    tones: [{ wave: "sine", freq: 170, to: 120, level: 0.26, decay: ms(50) }],
  },
  "type-big": {
    bursts: [{ filter: "bandpass", freq: 2600, q: 0.9, level: 0.26, decay: ms(18) }],
    tones: [{ wave: "sine", freq: 200, to: 140, level: 0.28, decay: ms(45) }],
  },
  "type-up": {
    bursts: [{ filter: "bandpass", freq: 4400, q: 1.3, level: 0.08, decay: ms(8) }],
    tones: [],
  },
  open: {
    bursts: [{ filter: "bandpass", freq: 2600, q: 1, level: 0.2, decay: ms(14) }],
    tones: [{ wave: "sine", freq: 520, to: 820, level: 0.12, decay: ms(70), attack: ms(3) }],
  },
  // Marking a todo. Two notes long enough to survive a dropped audio buffer.
  mark: {
    bursts: [],
    tones: [
      { wave: "sine", freq: 523, level: 0.14, decay: ms(120), attack: ms(4) },
      { wave: "sine", freq: 784, level: 0.14, decay: ms(180), attack: ms(4), at: ms(90) },
    ],
  },
  success: {
    bursts: [],
    tones: [
      { wave: "sine", freq: 1318, level: 0.07, decay: ms(90), attack: ms(4) },
      { wave: "sine", freq: 1760, level: 0.07, decay: ms(160), attack: ms(4), at: ms(75) },
    ],
  },
  warning: {
    bursts: [],
    tones: [
      { wave: "triangle", freq: 880, level: 0.08, decay: ms(80) },
      { wave: "triangle", freq: 880, level: 0.08, decay: ms(80), at: ms(110) },
    ],
  },
  error: {
    bursts: [],
    tones: [
      { wave: "square", freq: 220, level: 0.04, decay: ms(90) },
      { wave: "square", freq: 196, level: 0.04, decay: ms(140), at: ms(120) },
    ],
  },
};

/** The overall gain every voice is scaled by, before the user's volume. */
const MASTER_GAIN = 0.55;
/** What a gain ramps down to; an exponential ramp cannot reach zero. */
const SILENCE = 0.0001;
/** Voices start a hair after "now", so scheduling never lands in the past. */
const START_DELAY = 0.002;

export const DEFAULT_SOUND_VOLUME = 0.4;

/** Holds a volume in 0..1; anything that is not a number is the default. */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOUND_VOLUME;
  return Math.min(1, Math.max(0, value));
}

export interface SoundEngine {
  play: (voice: SoundVoice) => void;
  setVolume: (volume: number) => void;
}

export interface SoundEngineOptions {
  volume: number;
  /** Builds the context on the first `play`. Defaults to the global `AudioContext`. */
  createContext?: () => AudioContext | undefined;
}

function createGlobalContext(): AudioContext | undefined {
  const scope = globalThis as unknown as {
    AudioContext?: new (options?: AudioContextOptions) => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  if (scope.AudioContext) return new scope.AudioContext({ latencyHint: "interactive" });
  if (scope.webkitAudioContext) return new scope.webkitAudioContext();
  return undefined;
}

/** A multiplier within ±`spread` of 1, so no two plays are identical. */
function vary(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

export function createSoundEngine({
  volume,
  createContext = createGlobalContext,
}: SoundEngineOptions): SoundEngine {
  let level = clampVolume(volume);
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let noise: AudioBuffer | undefined;
  // Once the context cannot be made (no API, or it threw), stop trying.
  let unavailable = false;

  const ensureContext = (): AudioContext | undefined => {
    if (unavailable) return undefined;
    if (context && context.state !== "closed") return context;
    try {
      const created = createContext();
      if (!created) {
        unavailable = true;
        return undefined;
      }
      context = created;
      master = undefined;
      noise = undefined;
      return context;
    } catch {
      unavailable = true;
      return undefined;
    }
  };

  const playBurst = (ctx: AudioContext, out: AudioNode, burst: BurstSpec, start: number) => {
    if (!noise) return;
    const at = start + (burst.at ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = vary(0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = burst.filter;
    filter.frequency.value = burst.freq * vary(0.06);
    filter.Q.value = burst.q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(burst.level * vary(0.08), at);
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + burst.decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(at, Math.random() * 0.4);
    source.stop(at + burst.decay + 0.02);
  };

  const playTone = (ctx: AudioContext, out: AudioNode, tone: ToneSpec, start: number) => {
    const at = start + (tone.at ?? 0);
    const attack = tone.attack ?? 0.001;
    const pitch = vary(0.04);
    const osc = ctx.createOscillator();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(tone.freq * pitch, at);
    if (tone.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, tone.to * pitch), at + tone.decay);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.linearRampToValueAtTime(tone.level * vary(0.08), at + attack);
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + Math.max(tone.decay, attack * 2));
    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + tone.decay + 0.02);
  };

  return {
    setVolume(next) {
      level = clampVolume(next);
    },
    play(voice) {
      if (level <= 0) return;
      try {
        const ctx = ensureContext();
        if (!ctx) return;
        if (ctx.state === "suspended") void Promise.resolve(ctx.resume()).catch(() => undefined);
        if (!master) {
          master = ctx.createGain();
          master.connect(ctx.destination);
        }
        if (!noise) {
          noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate / 2), ctx.sampleRate);
          const samples = noise.getChannelData(0);
          for (let index = 0; index < samples.length; index++) {
            samples[index] = Math.random() * 2 - 1;
          }
        }
        master.gain.value = MASTER_GAIN * level;
        const spec = VOICE_TABLE[voice];
        const start = ctx.currentTime + START_DELAY;
        for (const burst of spec.bursts) playBurst(ctx, master, burst, start);
        for (const tone of spec.tones) playTone(ctx, master, tone, start);
      } catch {
        // A blocked or broken audio stack must never break the interface.
      }
    },
  };
}
