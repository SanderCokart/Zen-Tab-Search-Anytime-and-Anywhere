import { useEffect, useState } from "preact/hooks";
import { debugError } from "../../lib/debug";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "../../lib/messaging/client";
import { formatTimerCountdown, stripTimerPrefix } from "../../lib/timer";
import type { TabInfo, TabTimer } from "../../lib/types";
import { formatTabDisplayTitle } from "../../lib/types";
import { TimerForm } from "./TimerForm";

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
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!Number.isInteger(tabId) || tabId < 0) {
      setError("Open this window from a tab to set a timer.");
      return;
    }

    let cancelled = false;
    const load = () =>
      Promise.all([
        sendExtensionMessage({ type: "getTab", tabId }),
        sendExtensionMessage({ type: "getSnapshot" }),
      ])
        .then(([nextTab, snapshot]) => {
          if (cancelled) {
            return;
          }
          setTab(nextTab);
          setTimer(snapshot.timers.find((item) => item.tabId === tabId));
        })
        .catch((reason) => {
          debugError("Could not load custom timer popup:", reason);
          if (!cancelled) {
            setError("Make sure the extension is enabled in Zen Browser.");
          }
        });

    void load();
    const unsubscribe = subscribeToSnapshotChanged(() => {
      void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tabId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const clear = () => {
    void sendExtensionMessage({ type: "clearTimer", tabId })
      .then(() => {
        setTimer(undefined);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Could not clear the timer."),
      );
  };

  return (
    <div class="flex flex-col gap-2.5">
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
          Current timer {formatTimerCountdown(timer.endAt, now)}
        </p>
      )}
      <TimerForm
        timer={timer}
        disabled={!tab}
        error={error}
        onSet={(endAt) => {
          void sendExtensionMessage({ type: "setTimer", tabId, endAt })
            .then(onClose)
            .catch((reason) => {
              debugError("Could not set custom timer:", reason);
              setError(reason instanceof Error ? reason.message : "Could not set the timer.");
            });
        }}
        onClear={clear}
      />
    </div>
  );
}
