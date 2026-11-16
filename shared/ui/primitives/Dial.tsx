import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { cn } from "@/shared/ui/cn";
import {
  angleToOffset,
  dragValue,
  keyboardValue,
  valueToAngle,
  wheelValue,
} from "@/shared/ui/primitives/dial-math";
import { stepIndex } from "@/shared/ui/primitives/slider-math";
import { useSound } from "@/shared/ui/sound/SoundContext";

export interface DialProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Names the dial for assistive technology. */
  label: string;
  /** Spoken form of the value, such as "40 percent". */
  valueText?: string;
  disabled?: boolean;
  "data-testid"?: string;
  class?: string;
}

/**
 * A rotary dial set into a ring of tick marks. It is a slider for assistive
 * technology: arrow keys step it, PageUp and PageDown take larger steps, Home
 * and End jump to the ends. Dragging up or down and the mouse wheel turn it. It
 * ticks once per step the value moves.
 */
export function Dial({
  value,
  min,
  max,
  step,
  onChange,
  label,
  valueText,
  disabled = false,
  "data-testid": testId,
  class: className,
}: DialProps) {
  const { play } = useSound();
  const drag = useRef<
    | {
        element: HTMLDivElement;
        /** Accumulated pixels of travel since the press; down is positive. */
        travel: number;
        lastY: number;
        value: number;
      }
    | undefined
  >(undefined);
  const current = useRef(value);
  current.current = value;

  const commit = (next: number) => {
    if (stepIndex(next, min, step) === stepIndex(current.current, min, step)) return;
    current.current = next;
    play("tick");
    onChange(next);
  };

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const next = keyboardValue(event.key, value, min, max, step);
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  };

  // While turning, the cursor is hidden through `data-turning`. Pointer lock
  // is not used: Firefox and Zen always put up a "press Escape to take back
  // control" banner for it, and pointer capture already keeps the drag.
  const endDrag = () => {
    const state = drag.current;
    drag.current = undefined;
    state?.element.removeAttribute("data-turning");
  };

  useEffect(() => {
    return () => {
      endDrag();
    };
  }, []);

  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const element = event.currentTarget;
    drag.current = { element, travel: 0, lastY: event.clientY, value };
    element.setAttribute("data-turning", "");
    element.setPointerCapture?.(event.pointerId);
    element.focus();
  };

  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    // Up turns the dial up.
    state.travel += event.clientY - state.lastY;
    state.lastY = event.clientY;
    commit(dragValue(state.value, state.travel, min, max, step));
  };

  const onWheel = (event: JSX.TargetedWheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    commit(wheelValue(event.deltaY, current.current, min, max, step));
  };

  const offset = angleToOffset(valueToAngle(value, min, max));

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      class={cn("zs-dial", className)}
      data-testid={testId}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-orientation="vertical"
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    >
      <span class="zs-dial-ticks" aria-hidden="true" />
      <span class="zs-dial-cap" aria-hidden="true" />
      <span
        class="zs-dial-dot"
        aria-hidden="true"
        style={{
          left: `calc(50% + ${(offset.x * 22.6).toFixed(2)}%)`,
          top: `calc(50% + ${(offset.y * 22.6).toFixed(2)}%)`,
        }}
      />
    </div>
  );
}
