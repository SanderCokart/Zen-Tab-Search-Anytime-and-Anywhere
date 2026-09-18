import { useEffect, useRef, useState } from "preact/hooks";
import {
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  parseTimerInput,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "../../lib/timer";
import type { TabTimer } from "../../lib/types";
import { cn } from "../cn";

const presetButtonClass =
  "cursor-pointer rounded-full border border-zen-line bg-zen-chip font-[inherit] text-zen-subtle hover:border-zen-border hover:bg-zen-accent hover:text-inherit focus-visible:border-zen-border focus-visible:bg-zen-accent focus-visible:text-inherit";
const primaryButtonClass =
  "cursor-pointer rounded-md border border-zen-border bg-zen-accent font-[inherit] text-inherit hover:bg-zen-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
const clearButtonClass =
  "cursor-pointer rounded-md border border-zen-clear bg-transparent font-[inherit] text-zen-faint hover:bg-zen-surface-faint";

export interface TimerFormProps {
  timer?: TabTimer;
  compact?: boolean;
  disabled?: boolean;
  error?: string;
  onSet: (endAt: number) => void;
  onClear?: () => void;
}

export function TimerForm({
  timer,
  compact = false,
  disabled = false,
  error,
  onSet,
  onClear,
}: TimerFormProps) {
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
      class={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) {
          submit();
        }
      }}
    >
      <div class="flex flex-col gap-1">
        <span class={cn("text-zen-faint", compact ? "text-[11px]" : "text-xs")}>Presets</span>
        <div class={cn("flex flex-wrap", compact ? "gap-1" : "gap-1.5")}>
          {TIMER_PRESETS.map((preset) => (
            <button
              type="button"
              class={cn(
                presetButtonClass,
                compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
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
      <label
        class={cn(
          "text-zen-faint flex flex-col",
          compact ? "gap-0.5 text-[11px]" : "gap-1 text-xs",
        )}
      >
        When
        <input
          ref={whenInputRef}
          class={cn(
            "border-zen-line bg-zen-chip placeholder:text-zen-muted w-full rounded-md border font-[inherit]",
            compact ? "h-6 px-1.5" : "h-8 px-2",
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
        <p class="text-zen-danger m-0 text-xs">Use a time like “tomorrow at 9am” or “1d 30m”.</p>
      )}
      <div class={cn("flex items-end", compact ? "gap-1.5" : "gap-3")}>
        <label
          class={cn(
            "text-zen-faint flex flex-1 flex-col",
            compact ? "gap-0.5 text-[11px]" : "gap-1 text-xs",
          )}
        >
          Ends at
          <input
            class={cn(
              "border-zen-line bg-zen-chip w-full rounded-md border font-[inherit] disabled:opacity-60",
              compact ? "h-6 px-1.5" : "h-8 px-2",
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
        <div class={cn("flex", compact ? "gap-1.5" : "gap-2")}>
          <button
            class={cn(primaryButtonClass, compact ? "h-6 px-1.5" : "h-8 px-2.5")}
            type="submit"
            disabled={disabled || !valid}
          >
            Set
          </button>
          {timer && onClear && (
            <button
              class={cn(clearButtonClass, compact ? "h-6 px-1.5" : "h-8 px-2.5")}
              type="button"
              onClick={onClear}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {message && <p class="text-zen-danger m-0 text-xs">{message}</p>}
    </form>
  );
}
