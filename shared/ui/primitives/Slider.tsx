import { cn } from "@/shared/ui/cn";
import { Lcd } from "@/shared/ui/primitives/Lcd";
import {
  fractionOf,
  snapToStep,
  stepIndex,
  tickCountFor,
} from "@/shared/ui/primitives/slider-math";
import { useSound } from "@/shared/ui/sound/SoundContext";

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Names the slider for assistive technology. */
  label: string;
  /** The number shown in the LCD; defaults to the value itself. */
  display?: string;
  /** Dimmed text after the number, such as "px". */
  unit?: string;
  disabled?: boolean;
  "data-testid"?: string;
  /** Extra classes for the wrapper; set `--zs-slider-width` to change the rail length. */
  class?: string;
  /** Use the leftover width in the row, and shrink instead of overflowing. */
  fill?: boolean;
}

/**
 * A fader: a dark rail with a red fill, a raised thumb, tick marks and a black
 * LCD readout. A native range input sits invisibly over it, so keys, dragging
 * and screen readers work as for any slider. It ticks once for each step the
 * value actually moves, never for pointer movement that stays on a step.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  display,
  unit,
  disabled = false,
  "data-testid": testId,
  class: className,
  fill = false,
}: SliderProps) {
  const { play } = useSound();
  const fraction = fractionOf(value, min, max);
  const ticks = tickCountFor(min, max, step);

  return (
    <span
      class={cn(
        "flex items-center gap-[var(--zen-space-3)]",
        fill ? "w-full min-w-0" : "flex-none",
        className,
      )}
    >
      <span class="zs-slider" data-fill={fill || undefined} data-disabled={disabled || undefined}>
        <span class="zs-slider-bar" />
        <span class="zs-slider-fill" style={{ width: `${fraction * 100}%` }} />
        <span
          class="zs-slider-thumb"
          style={{ left: `calc((100% - var(--zs-thumb)) * ${fraction})` }}
        />
        <span class="zs-slider-ticks" aria-hidden="true">
          {Array.from({ length: ticks }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <input
          type="range"
          class="zs-slider-input"
          data-testid={testId}
          aria-label={label}
          aria-valuetext={`${display ?? value}${unit ?? ""}`}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={value}
          onInput={(event) => {
            const next = snapToStep(Number(event.currentTarget.value), min, max, step);
            if (stepIndex(next, min, step) === stepIndex(value, min, step)) return;
            play("tick");
            onChange(next);
          }}
        />
      </span>
      <Lcd class="zs-readout zs-digits">
        {display ?? value}
        {unit && <u>{unit}</u>}
      </Lcd>
    </span>
  );
}
