import { useEffect, useRef, useState } from "preact/hooks";
import {
  durationParts,
  endAtFromDuration,
  formatTimerEndSentence,
  isAllowedTimerEnd,
  parseTimerInput,
  TIMER_PRESETS,
  type TimerDurationParts,
} from "@/features/timers/model/timer";
import type { TabTimer } from "@/shared/types";
import { clearButtonClass } from "@/shared/ui/button-styles";
import { cn } from "@/shared/ui/cn";
import { TextField } from "@/shared/ui/primitives/TextField";
import { useSound } from "@/shared/ui/sound/SoundContext";

const presetButtonClass = "zs-key font-[inherit]";
const primaryButtonClass = "zs-key font-[inherit]";

const DURATION_FIELDS = [
  { part: "days", label: "Days" },
  { part: "hours", label: "Hours" },
  { part: "minutes", label: "Minutes" },
] as const satisfies readonly { part: keyof TimerDurationParts; label: string }[];

export interface TimerFormProps {
  timer?: TabTimer;
  disabled?: boolean;
  error?: string;
  /** Clock for the wells. Defaults to the time of the render. */
  now?: number;
  /** Fires with the end time the wells and footer are showing. */
  onPreview?: (endAt: number) => void;
  /** Smaller wells for the form opened under a tab row. */
  compact?: boolean;
  onSet: (endAt: number) => void;
  onClear?: () => void;
}

export function TimerForm({
  timer,
  disabled = false,
  error,
  now = Date.now(),
  onPreview,
  compact = false,
  onSet,
  onClear,
}: TimerFormProps) {
  const { play } = useSound();
  const whenInputRef = useRef<HTMLInputElement>(null);
  const [endAt, setEndAt] = useState(timer?.endAt ?? Date.now() + 30 * 60_000);
  const [naturalInput, setNaturalInput] = useState("");
  const [localError, setLocalError] = useState<string>();
  const [draft, setDraft] = useState<{ part: keyof TimerDurationParts; value: string } | null>(
    null,
  );
  const parsedNaturalInput = naturalInput.trim()
    ? parseTimerInput(naturalInput, new Date(now))
    : endAt;
  const valid = parsedNaturalInput !== null && isAllowedTimerEnd(parsedNaturalInput, now);
  const message = error || localError;
  const parts = durationParts(endAt, now);
  const selectedPresetId = TIMER_PRESETS.find(
    (preset) => Math.abs(preset.endAt(new Date(now)) - endAt) < 60_000,
  )?.id;

  useEffect(() => {
    if (!disabled) {
      whenInputRef.current?.focus();
    }
  }, [disabled]);

  useEffect(() => {
    onPreview?.(endAt);
  }, [endAt, onPreview]);

  const applyParts = (next: TimerDurationParts) => {
    setLocalError(undefined);
    setNaturalInput("");
    setDraft(null);
    setEndAt(endAtFromDuration(next, now));
  };

  const submit = () => {
    const nextEndAt = naturalInput.trim() ? parseTimerInput(naturalInput, new Date(now)) : endAt;
    if (nextEndAt === null) {
      setLocalError("Enter a time like “tomorrow at 9am” or “1d 30m”.");
      play("error");
      return;
    }
    if (!isAllowedTimerEnd(nextEndAt, now)) {
      setLocalError("Choose a time between 1 minute and 31 days from now.");
      play("error");
      return;
    }
    setLocalError(undefined);
    play("success");
    onSet(nextEndAt);
  };

  return (
    <form
      class={cn(
        "[container-type:inline-size] flex min-h-0 flex-col",
        compact ? "gap-[var(--zen-space-2)]" : "flex-1 gap-[var(--zen-space-4)]",
      )}
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) {
          submit();
        }
      }}
    >
      <div class="grid flex-none grid-cols-3 gap-[var(--zen-space-3)]">
        {DURATION_FIELDS.map(({ part, label }) => (
          <label key={part} data-kit="field" class="flex flex-col gap-[var(--zen-space-2)]">
            <span data-kit="label" class="zs-label">
              {label}
            </span>
            <span
              class={cn(
                "zs-well [container-type:size] flex flex-none items-center rounded-[var(--zs-r-lcd)] px-[var(--zen-space-2)]",
                compact
                  ? "h-[calc(var(--zen-font-size)*5.5*var(--zen-scale))]"
                  : "h-[min(320px,24svh,28cqi)]",
              )}
            >
              <input
                data-kit="input"
                class="h-full w-full bg-transparent text-center font-[inherit] text-[length:min(62cqh,calc(var(--zen-font-size)*6))] leading-none text-inherit outline-none"
                inputMode="numeric"
                autoComplete="off"
                maxLength={2}
                aria-label={label}
                disabled={disabled}
                value={draft?.part === part ? draft.value : String(parts[part])}
                onInput={(event) => {
                  const raw = event.currentTarget.value.replace(/\D/g, "").slice(0, 2);
                  setDraft({ part, value: raw });
                  setLocalError(undefined);
                  setNaturalInput("");
                  setEndAt(
                    endAtFromDuration(
                      { ...parts, [part]: raw === "" ? 0 : Number.parseInt(raw, 10) },
                      now,
                    ),
                  );
                }}
                onBlur={() => setDraft((current) => (current?.part === part ? null : current))}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
                    return;
                  }
                  event.preventDefault();
                  const delta = event.key === "ArrowUp" ? 1 : -1;
                  applyParts({ ...parts, [part]: parts[part] + delta });
                }}
              />
            </span>
          </label>
        ))}
      </div>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(22ch,1fr))] gap-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]">
        {TIMER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            class={cn(
              presetButtonClass,
              "h-[calc(var(--zen-font-size)*2.6*var(--zen-scale))] px-[var(--zen-space-2)] whitespace-nowrap",
              preset.id === selectedPresetId &&
                "outline-zen-accent outline outline-2 outline-offset-2",
            )}
            disabled={disabled}
            onClick={() => {
              setLocalError(undefined);
              setDraft(null);
              setNaturalInput(preset.label);
              setEndAt(preset.endAt(new Date(now)));
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <TextField
        label="When"
        ref={whenInputRef}
        inputClass="h-[calc(var(--zen-font-size)*3.25*var(--zen-scale))] px-[var(--zen-space-3)] text-[length:var(--zen-text-lg)]"
        type="text"
        placeholder="tomorrow at 9am or 1d 30m"
        disabled={disabled}
        value={naturalInput}
        onInput={(event) => {
          const value = event.currentTarget.value;
          setLocalError(undefined);
          setDraft(null);
          setNaturalInput(value);
          const parsed = parseTimerInput(value, new Date(now));
          if (parsed !== null) {
            setEndAt(parsed);
          }
        }}
      />
      {naturalInput.trim() && parsedNaturalInput === null && (
        <p class="text-zen-danger m-0 text-[length:var(--zen-text-sm)]">
          Use a time like “tomorrow at 9am” or “1d 30m”.
        </p>
      )}
      <div class="flex flex-wrap items-center justify-between gap-[var(--zen-space-3)]">
        <p class="text-zen-subtle m-0 text-[length:var(--zen-text-md)]">
          {formatTimerEndSentence(endAt)}
        </p>
        <div class="flex gap-[var(--zen-space-2)]">
          <button
            class={cn(
              primaryButtonClass,
              "h-[calc(var(--zen-font-size)*2.75*var(--zen-scale))] px-[var(--zen-space-4)] text-[length:var(--zen-text-base)]",
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
                "h-[calc(var(--zen-font-size)*2.75*var(--zen-scale))] px-[var(--zen-space-4)] text-[length:var(--zen-text-base)]",
              )}
              type="button"
              onClick={onClear}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {message && <p class="text-zen-danger m-0 text-[length:var(--zen-text-sm)]">{message}</p>}
    </form>
  );
}
