import { useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "@/shared/messaging/client";
import {
  isActivatableTab,
  tabBrowserId,
  type SpaceInfo,
  type TabInfo,
  type TabTimer,
  type TabTodo,
  type TrafficLight,
} from "@/shared/types";
import { statusesByTabId } from "@/features/status/model/status";
import { todosByTabId } from "@/features/todos/model/todo";

export interface SearchSnapshotData {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  timers: Map<number, TabTimer>;
  todos: Map<number, TabTodo>;
  statuses: Map<number, TrafficLight>;
}

/**
 * Holds the last loaded snapshot across remounts, so a reopened search paints
 * from it at once and refreshes in the background.
 */
export interface SearchSnapshotCache {
  snapshot?: SearchSnapshotData;
}

export interface SearchSnapshotState {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  timers: Map<number, TabTimer>;
  todos: Map<number, TabTodo>;
  statuses: Map<number, TrafficLight>;
  loadError: string | null;
  /** True after the first snapshot request finishes, success or failure. */
  loaded: boolean;
  setStatuses: (
    update:
      | Map<number, TrafficLight>
      | ((current: Map<number, TrafficLight>) => Map<number, TrafficLight>),
  ) => void;
  setTabs: (update: (current: TabInfo[]) => TabInfo[]) => void;
  setTimers: (
    update: Map<number, TabTimer> | ((current: Map<number, TabTimer>) => Map<number, TabTimer>),
  ) => void;
  setTodos: (
    update: Map<number, TabTodo> | ((current: Map<number, TabTodo>) => Map<number, TabTodo>),
  ) => void;
}

function tabRankingSignature(tab: TabInfo): string {
  return [
    tab.id ?? "",
    tab.domId ?? "",
    tab.title,
    tab.customLabel ?? "",
    tab.url,
    tab.workspaceName ?? "",
    tab.folderName ?? "",
    tab.folderId ?? "",
    tab.active === true ? "1" : "0",
    tab.essential === true ? "1" : "0",
    tab.pinned === true ? "1" : "0",
    tab.lastOpenedAt ?? "",
    tab.forgeTargetBranch ?? "",
  ].join("\0");
}

function sameRankingTabs(first: TabInfo[], second: TabInfo[]): boolean {
  if (first.length !== second.length) {
    return false;
  }
  return first.every(
    (tab, index) => tabRankingSignature(tab) === tabRankingSignature(second[index]!),
  );
}

function sameSpaces(first: SpaceInfo[], second: SpaceInfo[]): boolean {
  if (first.length !== second.length) {
    return false;
  }
  return first.every((space, index) => {
    const other = second[index];
    return (
      other !== undefined &&
      space.id === other.id &&
      space.name === other.name &&
      space.icon === other.icon &&
      space.isActive === other.isActive
    );
  });
}

/**
 * Loads tabs, spaces and timers from the background script and keeps them in
 * sync with the `snapshotChanged` broadcast. With a cache holding an earlier
 * snapshot, it starts from that one, already loaded, and refreshes it.
 */
export function useSearchSnapshot(cache?: SearchSnapshotCache): SearchSnapshotState {
  const cached = cache?.snapshot;
  const [tabs, setTabs] = useState<TabInfo[]>(() => cached?.tabs ?? []);
  const [spaces, setSpaces] = useState<SpaceInfo[]>(() => cached?.spaces ?? []);
  const [timers, setTimers] = useState<Map<number, TabTimer>>(() => cached?.timers ?? new Map());
  const [todos, setTodos] = useState<Map<number, TabTodo>>(() => cached?.todos ?? new Map());
  const [statuses, setStatuses] = useState<Map<number, TrafficLight>>(
    () => cached?.statuses ?? new Map(),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(cached !== undefined);

  // Local edits (a timer set, a todo marked) count too, so the next open shows them.
  useEffect(() => {
    if (cache && loaded && loadError === null) {
      cache.snapshot = { tabs, spaces, timers, todos, statuses };
    }
  }, [cache, loaded, loadError, tabs, spaces, timers, todos, statuses]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    // Todos come in their own request. A newer one supersedes an older one still in flight.
    let todoRequest = 0;

    const loadTodos = (tabIds: number[]) => {
      const request = ++todoRequest;
      sendExtensionMessage({ type: "getTodos", tabIds })
        .then((list) => {
          if (!cancelled && request === todoRequest) {
            setTodos(todosByTabId(list));
          }
        })
        .catch((error) => debugError("Could not load todos:", error));
    };

    const load = () => {
      if (cancelled) {
        return;
      }
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      sendExtensionMessage({ type: "getSnapshot" })
        .then((snapshot) => {
          if (cancelled) {
            return;
          }
          const nextTabs = snapshot.tabs.filter(isActivatableTab);
          setTabs((current) => (sameRankingTabs(current, nextTabs) ? current : nextTabs));
          setSpaces((current) =>
            sameSpaces(current, snapshot.spaces) ? current : snapshot.spaces,
          );
          setTimers(new Map(snapshot.timers.map((item) => [item.tabId, item])));
          setStatuses(statusesByTabId(snapshot.statuses));
          setLoadError(null);
          loadTodos(
            nextTabs.flatMap((tab) => {
              const id = tabBrowserId(tab);
              return id === undefined ? [] : [id];
            }),
          );
        })
        .catch((error) => {
          debugError("Could not load search data:", error);
          if (!cancelled) {
            setLoadError("Unable to load tabs. Make sure the extension is enabled in Zen Browser.");
          }
        })
        .finally(() => {
          inFlight = false;
          if (cancelled) {
            return;
          }
          setLoaded(true);
          if (queued) {
            queued = false;
            load();
          }
        });
    };

    void load();
    const unsubscribe = subscribeToSnapshotChanged(() => load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    tabs,
    spaces,
    timers,
    todos,
    statuses,
    loadError,
    loaded,
    setTabs,
    setTimers,
    setTodos,
    setStatuses,
  };
}
