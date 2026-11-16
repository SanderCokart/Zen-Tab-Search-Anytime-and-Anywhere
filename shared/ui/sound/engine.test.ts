import { describe, expect, it, vi } from "vitest";
import {
  clampVolume,
  createSoundEngine,
  DEFAULT_SOUND_VOLUME,
  SOUND_VOICES,
  VOICE_TABLE,
} from "@/shared/ui/sound/engine";

function fakeParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function fakeNode() {
  return { connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
}

/** Just enough of an AudioContext for the engine to build a voice. */
function fakeContext(state: AudioContextState = "running") {
  const gains: { gain: ReturnType<typeof fakeParam> }[] = [];
  const raw = {
    state,
    currentTime: 1,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(async () => undefined),
    createBuffer: vi.fn((_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    })),
    createGain: vi.fn(() => {
      const node = { ...fakeNode(), gain: fakeParam() };
      gains.push(node);
      return node;
    }),
    createBufferSource: vi.fn(() => ({ ...fakeNode(), playbackRate: fakeParam(), buffer: null })),
    createBiquadFilter: vi.fn(() => ({
      ...fakeNode(),
      type: "",
      frequency: fakeParam(),
      Q: fakeParam(),
    })),
    createOscillator: vi.fn(() => ({
      ...fakeNode(),
      type: "",
      frequency: fakeParam(),
    })),
  };
  return { context: raw as unknown as AudioContext, raw, gains };
}

describe("voice table", () => {
  it("has a voice for every name, each with at least one sound in it", () => {
    expect(Object.keys(VOICE_TABLE).sort()).toEqual([...SOUND_VOICES].sort());
    for (const voice of SOUND_VOICES) {
      const spec = VOICE_TABLE[voice];
      expect(spec.bursts.length + spec.tones.length, voice).toBeGreaterThan(0);
    }
  });

  it("describes sounds the audio graph can play", () => {
    for (const voice of SOUND_VOICES) {
      const { bursts, tones } = VOICE_TABLE[voice];
      for (const burst of bursts) {
        expect(burst.freq, voice).toBeGreaterThan(0);
        expect(burst.q, voice).toBeGreaterThan(0);
        expect(burst.level, voice).toBeGreaterThan(0);
        expect(burst.level, voice).toBeLessThanOrEqual(1);
        expect(burst.decay, voice).toBeGreaterThan(0);
        expect(burst.at ?? 0, voice).toBeGreaterThanOrEqual(0);
      }
      for (const tone of tones) {
        expect(tone.freq, voice).toBeGreaterThan(0);
        if (tone.to !== undefined) expect(tone.to, voice).toBeGreaterThan(0);
        expect(tone.level, voice).toBeGreaterThan(0);
        expect(tone.level, voice).toBeLessThanOrEqual(1);
        // The attack must finish inside the decay, or the envelope runs backwards.
        expect(tone.decay, voice).toBeGreaterThan(tone.attack ?? 0.001);
        expect(tone.at ?? 0, voice).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("clampVolume", () => {
  it("holds the volume in 0..1 and replaces non-numbers with the default", () => {
    expect(clampVolume(0.25)).toBe(0.25);
    expect(clampVolume(-3)).toBe(0);
    expect(clampVolume(7)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_SOUND_VOLUME);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SOUND_VOLUME);
  });
});

describe("createSoundEngine", () => {
  it("is a silent no-op without an AudioContext", () => {
    // jsdom has none, so the default factory finds nothing to build.
    expect("AudioContext" in globalThis).toBe(false);
    const engine = createSoundEngine({ volume: 0.4 });
    expect(() => SOUND_VOICES.forEach((voice) => engine.play(voice))).not.toThrow();
  });

  it("stays silent, and stops trying, when the context cannot be made", () => {
    const createContext = vi.fn(() => {
      throw new Error("blocked by Permissions-Policy");
    });
    const engine = createSoundEngine({ volume: 0.4, createContext });
    expect(() => engine.play("tick")).not.toThrow();
    expect(() => engine.play("tick")).not.toThrow();
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("stays silent when building a voice throws", () => {
    const { context, raw } = fakeContext();
    raw.createBuffer.mockImplementation(() => {
      throw new Error("no buffer");
    });
    const engine = createSoundEngine({ volume: 0.4, createContext: () => context });
    expect(() => engine.play("down")).not.toThrow();
  });

  it("builds a voice from its table entry, creating the context on the first play", () => {
    const { context, raw } = fakeContext();
    const createContext = vi.fn(() => context);
    const engine = createSoundEngine({ volume: 0.4, createContext });
    expect(createContext).not.toHaveBeenCalled();

    engine.play("latch-down");
    const spec = VOICE_TABLE["latch-down"];
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(raw.createBufferSource).toHaveBeenCalledTimes(spec.bursts.length);
    expect(raw.createOscillator).toHaveBeenCalledTimes(spec.tones.length);

    engine.play("tick");
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("resumes a suspended context", () => {
    const { context, raw } = fakeContext("suspended");
    createSoundEngine({ volume: 0.4, createContext: () => context }).play("tick");
    expect(raw.resume).toHaveBeenCalled();
  });

  it("scales the master gain by the clamped volume, and plays nothing at zero", () => {
    const { context, raw, gains } = fakeContext();
    const engine = createSoundEngine({ volume: 5, createContext: () => context });
    engine.play("tick");
    // The first gain made is the master one; 0.55 is the kit's master level.
    expect(gains[0]?.gain.value).toBeCloseTo(0.55);

    engine.setVolume(-1);
    const made = raw.createOscillator.mock.calls.length;
    engine.play("tick");
    expect(raw.createOscillator.mock.calls.length).toBe(made);

    engine.setVolume(0.5);
    engine.play("tick");
    expect(gains[0]?.gain.value).toBeCloseTo(0.275);
  });
});
