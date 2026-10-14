import type { SpaceInfo, TabInfo, TabStatus, TabTimer, TabTodo } from "@/shared/types";
import { tabBrowserId } from "@/shared/types";
import { SNAPSHOT_CHANGED_TYPE } from "@/shared/messaging/protocol";
import { mergeTabLastOpened, TAB_LAST_OPENED_STORAGE_KEY } from "@/features/zen/tab-last-opened";

export interface SearchSnapshotPayload {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  timers: TabTimer[];
  todos: TabTodo[];
  statuses: TabStatus[];
}

export function createSnapshotReader(deps: {
  queryTabs(anchorTabId?: number): Promise<TabInfo[]>;
  getSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
  getTimers(tabIds?: number[]): Promise<TabTimer[]>;
  getTodos?(tabIds: number[]): Promise<TabTodo[]>;
  getStatuses?(tabIds: number[]): Promise<TabStatus[]>;
  readLastOpened?(): Promise<Record<string, number>>;
}): (anchorTabId?: number) => Promise<SearchSnapshotPayload> {
  return async (anchorTabId?: number): Promise<SearchSnapshotPayload> => {
    const [tabs, spaces, lastOpened] = await Promise.all([
      deps.queryTabs(anchorTabId),
      deps.getSpaces(anchorTabId),
      deps.readLastOpened?.() ?? Promise.resolve({}),
    ]);
    const tabIds = tabs.flatMap((tab) => {
      const id = tabBrowserId(tab);
      return id === undefined ? [] : [id];
    });
    const [timers, todos, statuses] = await Promise.all([
      deps.getTimers(tabIds),
      deps.getTodos ? deps.getTodos(tabIds) : Promise.resolve([]),
      deps.getStatuses ? deps.getStatuses(tabIds) : Promise.resolve([]),
    ]);
    return { tabs: mergeTabLastOpened(tabs, lastOpened), spaces, timers, todos, statuses };
  };
}

export function createCachedSnapshotReader(
  read: (anchorTabId?: number) => Promise<SearchSnapshotPayload>,
): {
  getSnapshot(anchorTabId?: number): Promise<SearchSnapshotPayload>;
  invalidate(): void;
} {
  const UNSET = Symbol("unset");
  let epoch = 0;
  let payload: SearchSnapshotPayload | undefined;
  let payloadAnchor: number | undefined | typeof UNSET = UNSET;
  let inflight: Promise<SearchSnapshotPayload> | undefined;
  let inflightAnchor: number | undefined | typeof UNSET = UNSET;

  return {
    invalidate() {
      epoch += 1;
      payload = undefined;
      payloadAnchor = UNSET;
    },
    async getSnapshot(anchorTabId?: number): Promise<SearchSnapshotPayload> {
      if (payload && payloadAnchor === anchorTabId) {
        return payload;
      }
      if (inflight && inflightAnchor === anchorTabId) {
        return inflight;
      }

      const started = epoch;
      inflightAnchor = anchorTabId;
      inflight = read(anchorTabId)
        .then((next) => {
          if (started === epoch) {
            payload = next;
            payloadAnchor = anchorTabId;
          }
          return next;
        })
        .finally(() => {
          inflight = undefined;
          inflightAnchor = UNSET;
        });
      return inflight;
    },
  };
}

export function notifySnapshotChanged(): void {
  void browser.runtime.sendMessage({ type: SNAPSHOT_CHANGED_TYPE }).catch(() => {
    // Popup and omnibar listeners are optional.
  });
}

export function registerSnapshotChangeNotifications(
  debounceMs = 150,
  onNotify?: () => void,
): () => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = undefined;
      onNotify?.();
      notifySnapshotChanged();
    }, debounceMs);
  };

  const onStorageChanged = (changes: Record<string, unknown>, area: string) => {
    if (area === "local" && ("tabTimers" in changes || TAB_LAST_OPENED_STORAGE_KEY in changes)) {
      notify();
    }
  };
  const onTabUpdated = (
    _tabId: number,
    changeInfo: {
      url?: string;
      title?: string;
      pinned?: boolean;
      favIconUrl?: string;
      status?: string;
    },
  ) => {
    if (changeInfo.url || changeInfo.title !== undefined || changeInfo.pinned !== undefined) {
      notify();
    }
  };

  browser.storage.onChanged.addListener(onStorageChanged);
  browser.tabs.onCreated.addListener(notify);
  browser.tabs.onRemoved.addListener(notify);
  browser.tabs.onUpdated.addListener(onTabUpdated);
  browser.tabs.onActivated.addListener(notify);
  browser.tabs.onMoved.addListener(notify);

  return () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    browser.storage.onChanged.removeListener(onStorageChanged);
    browser.tabs.onCreated.removeListener(notify);
    browser.tabs.onRemoved.removeListener(notify);
    browser.tabs.onUpdated.removeListener(onTabUpdated);
    browser.tabs.onActivated.removeListener(notify);
    browser.tabs.onMoved.removeListener(notify);
  };
}
