import { useEffect, useState } from "preact/hooks";
import { debugError } from "../../lib/debug";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "../../lib/messaging/client";
import {
  formatTimerCountdown,
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  parseTimerInput,
  stripTimerPrefix,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "../../lib/timer";
import type { TabInfo, TabTimer } from "../../lib/types";
import { formatTabDisplayTitle } from "../../lib/types";

function hostname(url: string): string {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}

export function TimerPopup({ tabId, onClose }: { tabId: number; onClose: () => void }) {
  const [tab, setTab] = useState<TabInfo>();
  const [timer, setTimer] = useState<TabTimer>();
  const [endAt, setEndAt] = useState(Date.now() + 30 * 60_000);
  const [naturalInput, setNaturalInput] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!Number.isInteger(tabId) || tabId < 0) {
      setError("Open this window from a tab to set a timer.");
      return;
    }

    let cancelled = false;
    const load = (preserveEndAt: boolean) =>
      Promise.all([
        sendExtensionMessage({ type: "getTab", tabId }),
        sendExtensionMessage({ type: "getSnapshot" }),
      ])
        .then(([nextTab, snapshot]) => {
          if (cancelled) {
            return;
          }
          const nextTimer = snapshot.timers.find((item) => item.tabId === tabId);
          setTab(nextTab);
          setTimer(nextTimer);
          if (!preserveEndAt) {
            setEndAt(nextTimer?.endAt ?? Date.now() + 30 * 60_000);
          }
        })
        .catch((reason) => {
          debugError("Could not load custom timer popup:", reason);
          if (!cancelled) {
            setError("Make sure the extension is enabled in Zen Browser.");
          }
        });

    void load(false);
    const unsubscribe = subscribeToSnapshotChanged(() => {
      void load(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tabId]);

  useEffect(() => {
    const id = window.setInterval(() => setEndAt((value) => value), 1000);
    return () => window.clearInterval(id);
  }, []);

  const parsedNaturalInput = naturalInput.trim() ? parseTimerInput(naturalInput) : endAt;
  const valid = parsedNaturalInput !== null && isAllowedTimerEnd(parsedNaturalInput);
  const submit = () => {
    const nextEndAt = naturalInput.trim() ? parseTimerInput(naturalInput) : endAt;
    if (nextEndAt === null) {
      setError("Enter a time like “tomorrow at 9am” or “1d 30m”.");
      return;
    }
    if (!isAllowedTimerEnd(nextEndAt)) {
      setError("Choose a time between 1 minute and 31 days from now.");
      return;
    }
    void sendExtensionMessage({ type: "setTimer", tabId, endAt: nextEndAt })
      .then(onClose)
      .catch((reason) => {
        debugError("Could not set custom timer:", reason);
        setError(reason instanceof Error ? reason.message : "Could not set the timer.");
      });
  };
  const clear = () => {
    void sendExtensionMessage({ type: "clearTimer", tabId })
      .then(() => {
        setTimer(undefined);
        setEndAt(Date.now() + 30 * 60_000);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Could not clear the timer."),
      );
  };

  return (
    <form
      class="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h1 class="m-0 truncate text-sm font-semibold">
        {tab
          ? formatTabDisplayTitle({ ...tab, customLabel: stripTimerPrefix(tab.customLabel || "") })
          : "Loading tab…"}
      </h1>
      {tab && (
        <p class="text-zen-subtle m-0 text-xs">
          {tab.workspaceName || hostname(tab.url) || tab.url || "No URL"}
        </p>
      )}
      {timer && (
        <p class="text-zen-lavender m-0 text-xs">
          Current timer {formatTimerCountdown(timer.endAt)}
        </p>
      )}
      <div class="flex flex-col gap-1">
        <span class="text-zen-faint text-xs">Presets</span>
        <div class="flex flex-wrap gap-1.5">
          {TIMER_PRESETS.map((preset) => (
            <button
              type="button"
              class="border-zen-line bg-zen-chip text-zen-subtle hover:border-zen-border hover:bg-zen-accent focus-visible:border-zen-border focus-visible:bg-zen-accent cursor-pointer rounded-full border px-2 py-1 font-[inherit] text-xs hover:text-white focus-visible:text-white"
              onClick={() => {
                setError(undefined);
                setNaturalInput(preset.label);
                setEndAt(preset.endAt(new Date()));
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <label class="text-zen-faint flex flex-col gap-1 text-xs">
        When
        <input
          class="border-zen-line bg-zen-chip h-8 rounded-md border px-2 font-[inherit] text-white [color-scheme:dark] placeholder:text-white/40"
          type="text"
          placeholder="tomorrow at 9am or 1d 30m"
          disabled={!tab}
          value={naturalInput}
          onInput={(event) => {
            const value = event.currentTarget.value;
            setError(undefined);
            setNaturalInput(value);
            const parsed = parseTimerInput(value);
            if (parsed !== null) {
              setEndAt(parsed);
            }
          }}
        />
      </label>
      <div class="flex items-end gap-3">
        <div class="flex-1">
          <label class="text-zen-faint flex flex-col gap-1 text-xs">
            Ends at
            <input
              class="border-zen-line bg-zen-chip h-8 w-full rounded-md border px-2 font-[inherit] text-white [color-scheme:dark] disabled:opacity-60"
              type="datetime-local"
              step="60"
              required
              disabled={!tab}
              min={toDatetimeLocalValue(Date.now() + 60_000)}
              max={toDatetimeLocalValue(Date.now() + MAX_TIMER_MS)}
              value={toDatetimeLocalValue(endAt)}
              onInput={(event) => {
                setError(undefined);
                setNaturalInput("");
                setEndAt(fromDatetimeLocalValue(event.currentTarget.value));
              }}
            />
          </label>
        </div>
        <div class="flex gap-2">
          <button
            class="border-zen-border bg-zen-accent hover:bg-zen-accent-hover h-8 cursor-pointer rounded-md border px-2.5 font-[inherit] text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={!tab || !valid}
          >
            Set
          </button>
          {timer && (
            <button
              class="border-zen-clear text-zen-faint h-8 cursor-pointer rounded-md border bg-transparent px-2.5 font-[inherit] hover:bg-white/5"
              type="button"
              onClick={clear}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {error && <p class="text-zen-danger m-0 text-xs">{error}</p>}
    </form>
  );
}
