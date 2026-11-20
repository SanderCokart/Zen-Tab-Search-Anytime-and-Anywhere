import type { JSX } from "preact";
import { cn } from "@/shared/ui/cn";
import { useSound } from "@/shared/ui/sound/SoundContext";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the select control. */
  label: string;
  disabled?: boolean;
  class?: string;
  "data-testid"?: string;
}

/**
 * A compact native select styled to match the hardware keys. Used when a
 * segmented row would grow too wide for its module.
 */
export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  class: className,
  "data-testid": testId,
}: SelectProps<T>) {
  const { play } = useSound();

  const onSelectChange = (event: JSX.TargetedEvent<HTMLSelectElement>) => {
    const next = event.currentTarget.value as T;
    if (next === value) return;
    play("tick");
    onChange(next);
  };

  return (
    <div class={cn("relative inline-flex w-fit items-center", className)}>
      <select
        aria-label={label}
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={onSelectChange}
        class={cn(
          "zs-key zs-label min-h-[calc(var(--zen-font-size)*2.286)] min-w-[calc(var(--zen-font-size)*11)] cursor-pointer appearance-none",
          "pr-[calc(var(--zen-space-4)+var(--zen-icon-sm))] pl-[var(--zen-space-3)] text-left text-[var(--zs-ink-1)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            class="bg-[var(--zs-card)] text-[var(--zs-ink-1)]"
          >
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        class="pointer-events-none absolute right-[var(--zen-space-2)] size-[var(--zen-icon-sm)] text-[var(--zs-ink-2)]"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 4.5 6 7.5 9 4.5" />
      </svg>
    </div>
  );
}
