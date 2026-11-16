import { useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import {
  customColor,
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  subscribeToDisplaySettingsChanged,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";
import { uiScaleStyle } from "@/features/settings/model/ui-scale";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "@/shared/messaging/client";
import { formatTimerCountdown, stripTimerPrefix } from "@/features/timers/model/timer";
import type { TabInfo, TabTimer } from "@/shared/types";
import { formatTabDisplayTitle } from "@/shared/types";
import { TimerForm } from "@/features/timers/ui/TimerForm";
import { TabSummary } from "@/shared/ui/TabSummary";
import { useResolvedTheme } from "@/shared/ui/theme";
import { cn } from "@/shared/ui/cn";

export interface TimerPopupProps {
  tabId: number;
  onClose: () => void;
  /** Shown inside the omnibar, which already sets the sizing tokens and text colour. */
  embedded?: boolean;
}

export function TimerPopup({ tabId, onClose, embedded = false }: TimerPopupProps) {
  const [tab, setTab] = useState<TabInfo>();
  const [timer, setTimer] = useState<TabTimer>();
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string>();
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const theme = useResolvedTheme(displaySettings.theme);

  useEffect(() => {
    if (!browser.storage?.local) {
      return;
    }
    void readDisplaySettings()
      .then(setDisplaySettings)
      .catch(() => undefined);
    return subscribeToDisplaySettingsChanged(setDisplaySettings);
  }, []);

  useEffect(() => {
    if (!Number.isInteger(tabId) || tabId < 0) {
      setError("Open this window from a tab to set a timer.");
      return;
    }

    let cancelled = false;
    const fail = (reason: unknown) => {
      debugError("Could not load custom timer popup:", reason);
      if (!cancelled) {
        setError("Make sure the extension is enabled in Zen Browser.");
      }
    };
    // The tab loads on its own so the header names it even when the
    // snapshot cannot be read.
    const load = () =>
      Promise.all([
        sendExtensionMessage({ type: "getTab", tabId })
          .then((nextTab) => {
            if (!cancelled) {
              setTab(nextTab);
            }
          })
          .catch(fail),
        sendExtensionMessage({ type: "getSnapshot" })
          .then((snapshot) => {
            if (!cancelled) {
              setTimer(snapshot.timers.find((item) => item.tabId === tabId));
            }
          })
          .catch(fail),
      ]);

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
    // Inside the omnibar, Escape closes the whole omnibar instead.
    if (embedded) {
      return;
    }
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
  }, [embedded, onClose]);

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
    <div
      class={cn(
        "flex flex-col gap-[var(--zen-space-2)]",
        !embedded && "zs-chassis min-h-screen p-[var(--zen-space-3)]",
      )}
      data-zen-ui={embedded ? undefined : true}
      data-theme={embedded ? undefined : theme}
      style={
        embedded
          ? undefined
          : {
              ...uiScaleStyle(displaySettings, "popup"),
              colorScheme: theme,
              color: customColor(displaySettings.textColor),
            }
      }
    >
      <TabSummary
        label="Timer for"
        tab={tab}
        title={
          tab
            ? formatTabDisplayTitle({
                ...tab,
                customLabel: stripTimerPrefix(tab.customLabel || ""),
              })
            : "Loading tab…"
        }
      />
      {timer && (
        <p class="text-zen-timer zs-digits m-0 text-[length:var(--zen-text-xs)]">
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
