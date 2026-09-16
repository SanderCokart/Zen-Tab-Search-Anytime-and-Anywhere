import { useEffect, useState } from "preact/hooks";
import { debugError } from "../../lib/debug";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "../../lib/messaging/client";
import {
  formatTimerCountdown,
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
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

  const valid = isAllowedTimerEnd(endAt);
  const submit = () => {
    if (!valid) {
      setError("Choose a time between 1 minute and 31 days from now.");
      return;
    }
    void sendExtensionMessage({ type: "setTimer", tabId, endAt })
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
      class="zen-timer-popup"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h1>
        {tab
          ? formatTabDisplayTitle({ ...tab, customLabel: stripTimerPrefix(tab.customLabel || "") })
          : "Loading tab…"}
      </h1>
      {tab && (
        <p class="zen-timer-meta">
          {tab.workspaceName || hostname(tab.url) || tab.url || "No URL"}
        </p>
      )}
      {timer && <p class="zen-timer-status">Current timer {formatTimerCountdown(timer.endAt)}</p>}
      <div class="zen-timer-presets">
        {TIMER_PRESETS.map((preset) => (
          <button
            type="button"
            class="zen-timer-preset"
            onClick={() => {
              setError(undefined);
              setEndAt(preset.endAt(new Date()));
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label class="zen-timer-field">
        Ends at
        <input
          class="zen-timer-input"
          type="datetime-local"
          step="60"
          required
          disabled={!tab}
          min={toDatetimeLocalValue(Date.now() + 60_000)}
          max={toDatetimeLocalValue(Date.now() + MAX_TIMER_MS)}
          value={toDatetimeLocalValue(endAt)}
          onInput={(event) => {
            setError(undefined);
            setEndAt(fromDatetimeLocalValue(event.currentTarget.value));
          }}
        />
      </label>
      <p class="zen-timer-preview">
        {Number.isFinite(endAt)
          ? valid
            ? formatTimerCountdown(endAt)
            : "Choose a time between 1 minute and 31 days from now."
          : "Pick a time to count down to."}
      </p>
      <div class="zen-timer-actions">
        <button class="zen-timer-button" type="submit" disabled={!tab || !valid}>
          Set timer
        </button>
        {timer && (
          <button class="zen-timer-button zen-timer-clear" type="button" onClick={clear}>
            Clear
          </button>
        )}
      </div>
      {error && <p class="zen-timer-error">{error}</p>}
    </form>
  );
}
