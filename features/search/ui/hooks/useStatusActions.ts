import { useCallback } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { TrafficLight } from "@/shared/types";

type StatusMap = Map<number, TrafficLight>;

export interface UseStatusActionsOptions {
  setStatuses: (update: StatusMap | ((current: StatusMap) => StatusMap)) => void;
}

/** Status color changes from the status buttons and the context menu. */
export function useStatusActions({ setStatuses }: UseStatusActionsOptions) {
  /** Sets a tab's status color, or clears it with "none". The view updates before the background confirms. */
  const setStatus = useCallback(
    (tabId: number, light: TrafficLight | "none") => {
      setStatuses((current) => {
        const next = new Map(current);
        if (light === "none") {
          next.delete(tabId);
        } else {
          next.set(tabId, light);
        }
        return next;
      });
      void sendExtensionMessage({ type: "setTabStatus", tabId, light }).catch((error) =>
        debugError("Could not update status color:", error),
      );
    },
    [setStatuses],
  );

  return { setStatus };
}
