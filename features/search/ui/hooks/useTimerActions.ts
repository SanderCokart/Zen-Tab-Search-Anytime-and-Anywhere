import { useCallback } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { TabTimer } from "@/shared/types";

type TimerMap = Map<number, TabTimer>;

export interface UseTimerActionsOptions {
  setTimers: (update: TimerMap | ((current: TimerMap) => TimerMap)) => void;
  onTimerFormClose: () => void;
}

/** Timer mutations shared by the result rows, the context menu and the panel. */
export function useTimerActions({ setTimers, onTimerFormClose }: UseTimerActionsOptions) {
  const setTimer = useCallback(
    (tabId: number, endAt: number) => {
      void sendExtensionMessage({ type: "setTimer", tabId, endAt })
        .then((timer) => {
          setTimers((current) => new Map(current).set(tabId, timer));
          onTimerFormClose();
        })
        .catch((error) => debugError("Could not set timer:", error));
    },
    [onTimerFormClose, setTimers],
  );

  const clearTimer = useCallback(
    (tabId: number) => {
      void sendExtensionMessage({ type: "clearTimer", tabId })
        .then(() => {
          setTimers((current) => {
            const next = new Map(current);
            next.delete(tabId);
            return next;
          });
          onTimerFormClose();
        })
        .catch((error) => debugError("Could not clear timer:", error));
    },
    [onTimerFormClose, setTimers],
  );

  const clearAllTimers = useCallback(() => {
    void sendExtensionMessage({ type: "clearAllTimers" })
      .then(() => setTimers(new Map()))
      .catch((error) => debugError("Could not clear timers:", error));
  }, [setTimers]);

  const openTimerPopup = useCallback((tabId: number) => {
    void sendExtensionMessage({ type: "openTimerPopup", tabId }).catch((error) =>
      debugError("Could not open timer popup:", error),
    );
  }, []);

  return { setTimer, clearTimer, clearAllTimers, openTimerPopup };
}
