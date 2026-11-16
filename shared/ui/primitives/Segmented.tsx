import type { JSX } from "preact";
import { useRef } from "preact/hooks";
import { cn } from "@/shared/ui/cn";
import { Led } from "@/shared/ui/primitives/Led";
import { useSound } from "@/shared/ui/sound/SoundContext";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown after the label, in tabular digits. */
  count?: number;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive technology. */
  label: string;
  disabled?: boolean;
  class?: string;
}

/**
 * A row of mutually exclusive choices set into a well. The active segment is
 * pressed up as a key with a lit LED; the rest stay flat. Arrow keys move the
 * selection inside the group, as for any radio group.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  class: className,
}: SegmentedProps<T>) {
  const { play } = useSound();
  const group = useRef<HTMLDivElement>(null);

  const choose = (next: T) => {
    if (next === value) return;
    play("tick");
    onChange(next);
  };

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0 || disabled || options.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const current = options.findIndex((option) => option.value === value);
    const next = options[(current + step + options.length) % options.length];
    if (!next) return;
    choose(next.value);
    // The newly selected button takes focus once it is the tab stop.
    queueMicrotask(() =>
      group.current?.querySelector<HTMLButtonElement>("[aria-checked='true']")?.focus(),
    );
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      class={cn(
        "zs-well flex gap-[var(--zen-space-1)] rounded-[var(--zs-r-seg)] p-[var(--zen-space-1)]",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            class={cn(
              "zs-label flex min-h-[calc(var(--zen-font-size)*2.286)] flex-1 cursor-pointer items-center justify-center gap-[var(--zen-space-2)] border-0 px-[var(--zen-space-2)] py-[var(--zen-space-1)] font-[inherit] disabled:cursor-not-allowed disabled:opacity-50",
              "rounded-[calc(var(--zs-r-seg)*0.8)] bg-transparent",
              active &&
                "bg-[var(--zs-card-hi)] text-[var(--zs-ink-1)] shadow-[var(--zs-key-shadow)]",
            )}
            onClick={() => choose(option.value)}
          >
            {active && <Led on />}
            {option.label}
            {option.count !== undefined && (
              <span class="zs-digits text-[var(--zs-ink-3)]">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
