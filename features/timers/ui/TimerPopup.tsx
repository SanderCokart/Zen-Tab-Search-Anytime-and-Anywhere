import { useCallback, useEffect, useState } from "preact/hooks";
import { DEBUG, debugError } from "@/shared/debug";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  subscribeToDisplaySettingsChanged,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";
import { themeColorStyle } from "@/features/settings/model/theme-colors";
import { uiScaleStyle } from "@/features/settings/model/ui-scale";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "@/shared/messaging/client";
import { formatTimerEndShort, stripTimerPrefix } from "@/features/timers/model/timer";
import type { TabInfo, TabTimer } from "@/shared/types";
import { formatTabDisplayTitle } from "@/shared/types";
import { TimerForm } from "@/features/timers/ui/TimerForm";
import { TabSummary } from "@/shared/ui/TabSummary";
import { useResolvedTheme } from "@/shared/ui/theme";
import { cn } from "@/shared/ui/cn";

const TIMER_LAYOUTS = [
  { id: "full", label: "Full width", maxWidth: undefined, capWells: false },
  { id: "1440", label: "1440", maxWidth: 1440, capWells: false },
  { id: "1600", label: "1600", maxWidth: 1600, capWells: false },
  { id: "1440-h", label: "1440 + 320 tall", maxWidth: 1440, capWells: true },
] as const;

type TimerLayoutId = (typeof TIMER_LAYOUTS)[number]["id"];

const TIMER_LAYOUT_KEY = "zen-timer-layout-debug";

function readTimerLayout(): TimerLayoutId {
  try {
    const stored = sessionStorage.getItem(TIMER_LAYOUT_KEY);
    if (TIMER_LAYOUTS.some((layout) => layout.id === stored)) {
      return stored as TimerLayoutId;
    }
  } catch {
    // sessionStorage can be blocked; the button still cycles for this view.
  }
  return "full";
}

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
  const [previewEnd, setPreviewEnd] = useState<number>();
  const [layoutId, setLayoutId] = useState<TimerLayoutId>(readTimerLayout);
  const layout = TIMER_LAYOUTS.find((item) => item.id === layoutId) ?? TIMER_LAYOUTS[0];
  const onPreview = useCallback((endAt: number) => setPreviewEnd(endAt), []);

  const cycleLayout = () => {
    const index = TIMER_LAYOUTS.findIndex((item) => item.id === layoutId);
    const next = TIMER_LAYOUTS[(index + 1) % TIMER_LAYOUTS.length] ?? TIMER_LAYOUTS[0];
    setLayoutId(next.id);
    try {
      sessionStorage.setItem(TIMER_LAYOUT_KEY, next.id);
    } catch {
      // Keep the choice for this view when storage is blocked.
    }
  };
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
        "flex min-h-0 flex-col gap-[var(--zen-space-4)]",
        embedded ? "min-h-full flex-1" : "zs-chassis h-screen p-[var(--zen-space-4)]",
      )}
      data-zen-ui={embedded ? undefined : true}
      data-theme={embedded ? undefined : theme}
      style={
        embedded
          ? undefined
          : {
              ...uiScaleStyle(displaySettings, "popup"),
              colorScheme: theme,
              ...themeColorStyle(theme, displaySettings),
            }
      }
    >
      {DEBUG && (
        <div class="flex justify-end">
          <button
            type="button"
            class="zs-key px-[var(--zen-space-3)] py-[var(--zen-space-1)] font-[inherit] text-[length:var(--zen-text-sm)]"
            data-testid="zen-timer-layout-debug"
            onClick={cycleLayout}
          >
            Layout: {layout.label}
          </button>
        </div>
      )}
      <div
        class="mx-auto flex min-h-0 w-full flex-1 flex-col gap-[var(--zen-space-4)] self-center"
        style={layout.maxWidth === undefined ? undefined : { maxWidth: layout.maxWidth }}
      >
        <div class="flex items-start justify-between gap-[var(--zen-space-4)]">
          <TabSummary
            plain
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
          {previewEnd !== undefined && (
            <p class="text-zen-timer zs-digits m-0 shrink-0 pt-[var(--zen-space-4)] text-[length:var(--zen-text-lg)]">
              Ends {formatTimerEndShort(previewEnd)}
            </p>
          )}
        </div>
        <TimerForm
          timer={timer}
          now={now}
          disabled={!tab}
          error={error}
          capWells={layout.capWells}
          onPreview={onPreview}
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
    </div>
  );
}
