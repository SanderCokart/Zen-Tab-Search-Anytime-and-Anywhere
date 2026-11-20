/** Holds `value` in `min..max`; anything that is not a finite number is `fallback`. */
export function clamp(value: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

export interface SnapClampOptions {
  min: number;
  max: number;
  step: number;
  fallback: number;
}

/**
 * Snaps `value` to the nearest `step` and holds it in `min..max`. `min` and `max`
 * should be multiples of `step`; non-finite input is `fallback`.
 */
export function snapClamp(value: number, { min, max, step, fallback }: SnapClampOptions): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clamp(Math.round(value / step) * step, min, max);
}
