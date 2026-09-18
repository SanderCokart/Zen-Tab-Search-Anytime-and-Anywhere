import { useEffect, useRef, useState } from "preact/hooks";
import {
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  parseTimerInput,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "@/features/timers/model/timer";
import type { TabTimer } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

const presetButtonClass =
  "cursor-pointer rounded-full border border-zen-line bg-zen-chip font-[inherit] text-zen-subtle hover:border-zen-border hover:bg-zen-accent hover:text-inherit focus-visible:border-zen-border focus-visible:bg-zen-accent focus-visible:text-inherit";
const primaryButtonClass =
  "cursor-pointer rounded-md border border-zen-border bg-zen-accent font-[inherit] text-inherit hover:bg-zen-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
const clearButtonClass =
  "cursor-pointer rounded-md border border-zen-clear bg-transparent font-[inherit] text-zen-faint hover:bg-zen-surface-faint";

export interface TimerFormProps {
  timer?: TabTimer;
  disabled?: boolean;
  error?: string;
  onSet: (endAt: number) => void;
  onClear?: () => void;
}

export function TimerForm({ timer, disabled = false, error, onSet, onClear }: TimerFormProps) {
  const whenInputRef = useRef<HTMLInputElement>(null);
  const [endAt, setEndAt] = useState(timer?.endAt ?? Date.now() + 30 * 60_000);
  const [naturalInput, setNaturalInput] = useState("");
  const [localError, setLocalError] = useState<string>();
  const parsedNaturalInput = naturalInput.trim() ? parseTimerInput(naturalInput) : endAt;
  const valid = parsedNaturalInput !== null && isAllowedTimerEnd(parsedNaturalInput);
  const message = error || localError;

  useEffect(() => {
    if (!disabled) {
      whenInputRef.current?.focus();
    }
  }, [disabled]);

  const submit = () => {
    const nextEndAt = naturalInput.trim() ? parseTimerInput(naturalInput) : endAt;
    if (nextEndAt === null) {
      setLocalError("Enter a time like “tomorrow at 9am” or “1d 30m”.");
      return;
    }
    if (!isAllowedTimerEnd(nextEndAt)) {
      setLocalError("Choose a time between 1 minute and 31 days from now.");
      return;
    }
    setLocalError(undefined);
    onSet(nextEndAt);
  };

  return (
    <form
      class="flex flex-col gap-[var(--zen-space-2)]"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) {
          submit();
        }
      }}
    >
      <div class="flex flex-col gap-[var(--zen-space-1)]">
        <span class="text-zen-faint text-[length:var(--zen-text-xs)]">Presets</span>
        <div class="flex flex-wrap gap-[var(--zen-space-1)]">
          {TIMER_PRESETS.map((preset) => (
            <button
              type="button"
              class={cn(
                presetButtonClass,
                "px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-xs)]",
              )}
              disabled={disabled}
              onClick={() => {
                setLocalError(undefined);
                setNaturalInput(preset.label);
                setEndAt(preset.endAt(new Date()));
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <label class="text-zen-faint flex flex-col gap-[var(--zen-space-1)] text-[length:var(--zen-text-xs)]">
        When
        <input
          ref={whenInputRef}
          class={cn(
            "border-zen-line bg-zen-chip placeholder:text-zen-muted w-full rounded-[var(--zen-radius)] border font-[inherit]",
            "h-[calc(var(--zen-font-size)*2*var(--zen-scale))] px-[var(--zen-space-2)]",
          )}
          type="text"
          placeholder="tomorrow at 9am or 1d 30m"
          disabled={disabled}
          value={naturalInput}
          onInput={(event) => {
            const value = event.currentTarget.value;
            setLocalError(undefined);
            setNaturalInput(value);
            const parsed = parseTimerInput(value);
            if (parsed !== null) {
              setEndAt(parsed);
            }
          }}
        />
      </label>
      {naturalInput.trim() && parsedNaturalInput === null && (
        <p class="text-zen-danger m-0 text-[length:var(--zen-text-xs)]">
          Use a time like “tomorrow at 9am” or “1d 30m”.
        </p>
      )}
      <div class="flex items-end gap-[var(--zen-space-2)]">
        <label class="text-zen-faint flex flex-1 flex-col gap-[var(--zen-space-1)] text-[length:var(--zen-text-xs)]">
          Ends at
          <input
            class={cn(
              "border-zen-line bg-zen-chip w-full rounded-[var(--zen-radius)] border font-[inherit] disabled:opacity-60",
              "h-[calc(var(--zen-font-size)*2*var(--zen-scale))] px-[var(--zen-space-2)]",
            )}
            type="datetime-local"
            step="60"
            required
            disabled={disabled}
            min={toDatetimeLocalValue(Date.now() + 60_000)}
            max={toDatetimeLocalValue(Date.now() + MAX_TIMER_MS)}
            value={toDatetimeLocalValue(endAt)}
            onInput={(event) => {
              setLocalError(undefined);
              setNaturalInput("");
              setEndAt(fromDatetimeLocalValue(event.currentTarget.value));
            }}
          />
        </label>
        <div class="flex gap-[var(--zen-space-2)]">
          <button
            class={cn(
              primaryButtonClass,
              "h-[calc(var(--zen-font-size)*2*var(--zen-scale))] px-[var(--zen-space-2)]",
            )}
            type="submit"
            disabled={disabled || !valid}
          >
            Set
          </button>
          {timer && onClear && (
            <button
              class={cn(
                clearButtonClass,
                "h-[calc(var(--zen-font-size)*2*var(--zen-scale))] px-[var(--zen-space-2)]",
              )}
              type="button"
              onClick={onClear}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {message && <p class="text-zen-danger m-0 text-[length:var(--zen-text-xs)]">{message}</p>}
    </form>
  );
}
