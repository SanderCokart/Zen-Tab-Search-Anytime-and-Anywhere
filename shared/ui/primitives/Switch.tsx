import type { ComponentChildren } from "preact";
import { cn } from "@/shared/ui/cn";
import type { SoundVoice } from "@/shared/ui/sound/engine";
import { useSound } from "@/shared/ui/sound/SoundContext";

/** Latching down turns it on, springing back up turns it off. */
export function switchVoice(on: boolean): SoundVoice {
  return on ? "latch-down" : "latch-up";
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name when there is no visible `children` label. */
  label?: string;
  /** Shows the OFF and ON micro labels either side of the track. */
  showState?: boolean;
  disabled?: boolean;
  "data-testid"?: string;
  class?: string;
  /** The visible label; clicking it toggles the switch. */
  children?: ComponentChildren;
}

/**
 * A recessed track with a raised knob; red and glowing when on. The real control
 * is a native checkbox with `role="switch"` laid over the drawing, so Space
 * toggles it, the label is clickable and screen readers announce on or off.
 */
export function Switch({
  checked,
  onChange,
  label,
  showState = false,
  disabled = false,
  "data-testid": testId,
  class: className,
  children,
}: SwitchProps) {
  const { play } = useSound();
  return (
    <label class={cn("flex items-center gap-[var(--zen-space-3)]", className)}>
      {children !== undefined && <span class="min-w-0 flex-1">{children}</span>}
      <span class="zs-switch" data-on={checked || undefined} data-disabled={disabled || undefined}>
        {showState && (
          <small class="zs-switch-text" data-for="off" aria-hidden="true">
            OFF
          </small>
        )}
        <span class="zs-switch-track">
          <span class="zs-switch-nub" />
          <input
            type="checkbox"
            role="switch"
            class="zs-switch-input"
            data-testid={testId}
            checked={checked}
            disabled={disabled}
            aria-label={children === undefined ? label : undefined}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              play(switchVoice(next));
              onChange(next);
            }}
          />
        </span>
        {showState && (
          <small class="zs-switch-text" data-for="on" aria-hidden="true">
            ON
          </small>
        )}
      </span>
    </label>
  );
}
