import { useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "@/shared/messaging/client";
import { isActivatableTab, type SpaceInfo, type TabInfo, type TabTimer } from "@/shared/types";

export interface SearchSnapshotState {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  timers: Map<number, TabTimer>;
  loadError: string | null;
  setTabs: (update: (current: TabInfo[]) => TabInfo[]) => void;
  setTimers: (
    update: Map<number, TabTimer> | ((current: Map<number, TabTimer>) => Map<number, TabTimer>),
  ) => void;
}

/**
 * Loads tabs, spaces and timers from the background script and keeps them in
 * sync with the `snapshotChanged` broadcast.
 */
export function useSearchSnapshot(): SearchSnapshotState {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [timers, setTimers] = useState<Map<number, TabTimer>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      sendExtensionMessage({ type: "getSnapshot" })
        .then((snapshot) => {
          if (cancelled) return;
          setTabs(snapshot.tabs.filter(isActivatableTab));
          setSpaces(snapshot.spaces);
          setTimers(new Map(snapshot.timers.map((item) => [item.tabId, item])));
          setLoadError(null);
        })
        .catch((error) => {
          debugError("Could not load search data:", error);
          if (!cancelled) {
            setLoadError("Unable to load tabs. Make sure the extension is enabled in Zen Browser.");
          }
        });

    void load();
    const unsubscribe = subscribeToSnapshotChanged(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Re-render once a second so countdowns tick, but only while a timer exists.
  useEffect(() => {
    if (timers.size === 0) {
      return;
    }
    const id = window.setInterval(() => setTimers((current) => new Map(current)), 1000);
    return () => window.clearInterval(id);
  }, [timers.size]);

  return { tabs, spaces, timers, loadError, setTabs, setTimers };
}
