import { fractionOf, snapToStep } from "@/shared/ui/primitives/slider-math";

/** The dial turns this far either side of straight up. */
export const DIAL_SWEEP_DEGREES = 135;
/** A drag of this many pixels covers the dial's whole range. */
export const DIAL_DRAG_RANGE_PX = 160;

/** The pointer's angle for a value: -135 at the minimum, 0 straight up, 135 at the maximum. */
export function valueToAngle(value: number, min: number, max: number): number {
  return -DIAL_SWEEP_DEGREES + fractionOf(value, min, max) * DIAL_SWEEP_DEGREES * 2;
}

/** The inverse of {@link valueToAngle}, snapped to a step. */
export function angleToValue(angle: number, min: number, max: number, step: number): number {
  const fraction = (angle + DIAL_SWEEP_DEGREES) / (DIAL_SWEEP_DEGREES * 2);
  return snapToStep(min + fraction * (max - min), min, max, step);
}

/** Where the pointer's dot sits, as an offset from the dial's centre in units of its radius. */
export function angleToOffset(angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}

/** The value after dragging by `dy` pixels (negative is up) from where it started. */
export function dragValue(
  startValue: number,
  dy: number,
  min: number,
  max: number,
  step: number,
): number {
  return snapToStep(startValue - (dy / DIAL_DRAG_RANGE_PX) * (max - min), min, max, step);
}

/** The value after a key press, or undefined when the key is not one the dial answers to. */
export function keyboardValue(
  key: string,
  value: number,
  min: number,
  max: number,
  step: number,
  pageStep = (max - min) / 10,
): number | undefined {
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return snapToStep(value + step, min, max, step);
    case "ArrowDown":
    case "ArrowLeft":
      return snapToStep(value - step, min, max, step);
    case "PageUp":
      return snapToStep(value + pageStep, min, max, step);
    case "PageDown":
      return snapToStep(value - pageStep, min, max, step);
    case "Home":
      return min;
    case "End":
      return max;
    default:
      return undefined;
  }
}

/** The value after a wheel notch: up (negative `deltaY`) turns it up. */
export function wheelValue(
  deltaY: number,
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  if (deltaY === 0) return value;
  return snapToStep(value + (deltaY < 0 ? step : -step), min, max, step);
}
