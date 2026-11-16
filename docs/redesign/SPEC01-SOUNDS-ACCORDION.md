# SPEC-01 sounds, accordion and segmented control (research notes)

Source: github.com/shuding/spec-01 (MIT) — `registry/hardware/lib/sound.ts`, `ui/accordion.tsx`, `ui/collapsible.tsx`, `ui/segmented-control.tsx`, `ui/hardware/hardware-accordion.css`, `ui/hardware/tokens.css`. Values come from WebFetch summaries, so treat them as close but not byte-exact.

## Sound engine (pure Web Audio synthesis, no sample files)
- One shared mono white-noise buffer (sampleRate/2 long, `Math.random()*2-1`).
- **Burst** = noise source → biquad filter, random start offset ≤0.4 s, playback rate ±10%.
- **Tone** = oscillator (sine default), linear attack 1 ms, exponential decay to 0.0001 over `decay` s, frequency glide `freq → to` (floor 20 Hz).
- Per-play variation: pitch ±4%, level ±12%, filter freq ±6%, burst level ±15%. Voices start at `currentTime + 0.002`. Master gain 0.55.
- AudioContext is created lazily (`latencyHint: "interactive"`) and resumed when its state is not "running"; a closed context is replaced. Gestures (pointerdown/keydown/click) unlock it; it also resumes on `visibilitychange`.
- Mute: a flag persisted in localStorage `spec01:sound` (default on). No prefers-reduced-motion check.
- Press sounds fire on pointerdown (capture listener). Open sounds fire via a MutationObserver on `data-open`.

| voice | burst (filter, freq, Q, level, decay) | tone (wave, freq→to, level, decay) | extra |
|---|---|---|---|
| down | bandpass 2600 Q0.9 @0.32, 22 ms | sine 210→130 @0.4, 50 ms | |
| down-primary | bandpass 2100 Q0.8 @0.36, 26 ms | sine 165→100 @0.55, 70 ms | |
| up | bandpass 3900 Q1.2 @0.16, 12 ms | sine 300→240 @0.1, 18 ms | |
| latch-down | bandpass 2000 Q0.8 @0.18, 18 ms | sine 160→110 @0.2, 45 ms | spring burst 1150 Q14 @0.035 at +4 ms, 50 ms |
| latch-up | bandpass 3200 Q1 @0.11, 12 ms | — | spring 1600 Q12 @0.03 at +3 ms, 40 ms |
| tick | highpass 3200 Q0.7 @0.2, 6 ms | sine 4300 @0.035, 10 ms | |
| blip | — | square 2350 @0.035, attack 2 ms, 45 ms | |
| type | bandpass 3300 Q1.1 @0.22, 14 ms | sine 260→190 @0.18, 30 ms | |
| type-space | bandpass 2200 Q0.8 @0.26, 22 ms | sine 170→120 @0.26, 50 ms | rattle 900 Q6 @0.05 at +6 ms, 30 ms |
| type-big | bandpass 2600 Q0.9 @0.26, 18 ms | sine 200→140 @0.28, 45 ms | |
| type-up | bandpass 4400 Q1.3 @0.08, 8 ms | — | |
| open | bandpass 2600 Q1 @0.1, 12 ms | sine 520→820 @0.045, attack 3 ms, 60 ms | |
| success | — | sine 1318 then 1760 at +75 ms, @0.07, attack 4 ms, 90/160 ms | |
| warning | — | triangle 880 ×2 (second at +110 ms) @0.08, 80 ms | |
| error | — | square 220 @0.04 (90 ms), then 196 at +120 ms (140 ms) | |

## Accordion / collapsible
- Markup: accordion > item > header > trigger + LED span (`aria-hidden`); panel.
- Look: rows numbered with `counter(row, decimal-leading-zero)` in a muted grey, trigger about 46px tall, small uppercase label (letter-spacing .12em). The open state is shown by an **LED only** (off = `--led-off`; on = led colour + glow, 160 ms transition). No chevron.
- Panel: height animates 280 ms `cubic-bezier(0.3, 0.9, 0.3, 1)` to 0 when collapsed. `prefers-reduced-motion` disables the transition. The panel sits in a recessed tray (#ededeb in light).

## Segmented control
- Indicator + items + LED. Pointer drag of 4px or more moves the indicator; the selection fires a "selection" haptic and in practice a `tick` sound.
- Selected styling comes from the tabs kit: `--lift` transition 90 ms `cubic-bezier(0.3,0,0.6,1)`, with the selected item pressed down.

## Easing tokens
- `--ease-detent: cubic-bezier(0.45, 0, 0.15, 1)` — snaps (levers, latches, dials).
- `--ease-settle: cubic-bezier(0.2, 0.8, 0.2, 1)` — screens, meters, popups.
