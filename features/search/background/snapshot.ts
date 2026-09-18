import type { SpaceInfo, TabInfo, TabTimer } from "@/shared/types";
import { SNAPSHOT_CHANGED_TYPE } from "@/shared/messaging/protocol";
import { mergeTabLastOpened, TAB_LAST_OPENED_STORAGE_KEY } from "@/features/zen/tab-last-opened";

export interface SearchSnapshotPayload {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  timers: TabTimer[];
}

export function createSnapshotReader(deps: {
  queryTabs(anchorTabId?: number): Promise<TabInfo[]>;
  getSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
  getTimers(): Promise<TabTimer[]>;
  readLastOpened?(): Promise<Record<string, number>>;
}): (anchorTabId?: number) => Promise<SearchSnapshotPayload> {
  return async (anchorTabId?: number): Promise<SearchSnapshotPayload> => {
    const [tabs, spaces, timers, lastOpened] = await Promise.all([
      deps.queryTabs(anchorTabId),
      deps.getSpaces(anchorTabId),
      deps.getTimers(),
      deps.readLastOpened?.() ?? Promise.resolve({}),
    ]);
    return { tabs: mergeTabLastOpened(tabs, lastOpened), spaces, timers };
  };
}

export function notifySnapshotChanged(): void {
  void browser.runtime.sendMessage({ type: SNAPSHOT_CHANGED_TYPE }).catch(() => {
    // Popup and omnibar listeners are optional.
  });
}

export function registerSnapshotChangeNotifications(debounceMs = 150): () => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = undefined;
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
    changeInfo: { url?: string; favIconUrl?: string; status?: string },
  ) => {
    if (changeInfo.url || changeInfo.favIconUrl || changeInfo.status === "complete") {
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
