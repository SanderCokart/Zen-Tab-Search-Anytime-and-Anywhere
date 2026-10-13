import { useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "@/shared/messaging/client";
import {
  isActivatableTab,
  type SpaceInfo,
  type TabInfo,
  type TabTimer,
  type TodoStatus,
} from "@/shared/types";
import { todoStatusByTabId } from "@/features/todos/model/todo";

export interface SearchSnapshotState {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  timers: Map<number, TabTimer>;
  todos: Map<number, TodoStatus>;
  loadError: string | null;
  setTabs: (update: (current: TabInfo[]) => TabInfo[]) => void;
  setTimers: (
    update: Map<number, TabTimer> | ((current: Map<number, TabTimer>) => Map<number, TabTimer>),
  ) => void;
  setTodos: (
    update:
      | Map<number, TodoStatus>
      | ((current: Map<number, TodoStatus>) => Map<number, TodoStatus>),
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
    tab.lastOpenedAt ?? "",
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
 * sync with the `snapshotChanged` broadcast.
 */
export function useSearchSnapshot(): SearchSnapshotState {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [timers, setTimers] = useState<Map<number, TabTimer>>(new Map());
  const [todos, setTodos] = useState<Map<number, TodoStatus>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let queued = false;

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
          setTodos(todoStatusByTabId(snapshot.todos));
          setLoadError(null);
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

  return { tabs, spaces, timers, todos, loadError, setTabs, setTimers, setTodos };
}
