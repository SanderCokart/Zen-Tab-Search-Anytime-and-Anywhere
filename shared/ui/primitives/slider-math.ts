/** How far along its range a value is, from 0 to 1. */
export function fractionOf(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Rounds to the nearest step from `min`, holds it in range and trims float noise. */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (step <= 0) return clamped;
  const snapped = min + Math.round((clamped - min) / step) * step;
  const decimals = Math.max(decimalsOf(step), decimalsOf(min));
  return Math.min(max, Math.max(min, Number(snapped.toFixed(decimals))));
}

/** The number of the step a value sits on; two values on one step make no new sound. */
export function stepIndex(value: number, min: number, step: number): number {
  return step <= 0 ? value : Math.round((value - min) / step);
}

/** One tick mark per step, or a fixed count when the steps would be too many to draw. */
export function tickCountFor(min: number, max: number, step: number, cap = 21): number {
  if (step <= 0 || max <= min) return 2;
  const steps = Math.round((max - min) / step);
  return steps + 1 <= cap ? steps + 1 : cap;
}
