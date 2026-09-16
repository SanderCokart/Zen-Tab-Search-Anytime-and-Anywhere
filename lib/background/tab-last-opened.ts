import { isUsableTabId, tabBrowserId, type TabInfo } from "../types";

export const TAB_LAST_OPENED_STORAGE_KEY = "tabLastOpened";

export function parseStoredLastOpened(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const stored: Record<string, number> = {};
  for (const [key, timestamp] of Object.entries(value as Record<string, unknown>)) {
    if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
      stored[key] = timestamp;
    }
  }
  return stored;
}

export function mergeTabLastOpened(tabs: TabInfo[], stored: Record<string, number>): TabInfo[] {
  return tabs.map((tab) => {
    const tabId = tabBrowserId(tab);
    const storedAt = tabId === undefined ? undefined : stored[String(tabId)];
    const timestamps = [tab.lastOpenedAt, storedAt].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
    );
    return {
      ...tab,
      lastOpenedAt: timestamps.length ? Math.max(...timestamps) : undefined,
    };
  });
}

export async function readTabLastOpened(): Promise<Record<string, number>> {
  const stored = await browser.storage.local.get(TAB_LAST_OPENED_STORAGE_KEY);
  return parseStoredLastOpened(stored[TAB_LAST_OPENED_STORAGE_KEY]);
}

export async function recordTabLastOpened(tabId: number, openedAt = Date.now()): Promise<void> {
  if (!isUsableTabId(tabId) || !Number.isFinite(openedAt) || openedAt <= 0) {
    return;
  }

  const current = await readTabLastOpened();
  const key = String(tabId);
  if ((current[key] ?? 0) >= openedAt) {
    return;
  }

  current[key] = openedAt;
  await browser.storage.local.set({ [TAB_LAST_OPENED_STORAGE_KEY]: current });
}

export async function forgetTabLastOpened(tabId: number): Promise<void> {
  if (!isUsableTabId(tabId)) {
    return;
  }

  const current = await readTabLastOpened();
  const key = String(tabId);
  if (!(key in current)) {
    return;
  }

  delete current[key];
  await browser.storage.local.set({ [TAB_LAST_OPENED_STORAGE_KEY]: current });
}

export async function seedTabLastOpened(
  tabs: Array<{ id?: number; lastAccessed?: number }>,
): Promise<void> {
  const current = await readTabLastOpened();
  let changed = false;

  for (const tab of tabs) {
    if (!isUsableTabId(tab.id) || typeof tab.lastAccessed !== "number" || tab.lastAccessed <= 0) {
      continue;
    }
    const key = String(tab.id);
    if ((current[key] ?? 0) < tab.lastAccessed) {
      current[key] = tab.lastAccessed;
      changed = true;
    }
  }

  if (changed) {
    await browser.storage.local.set({ [TAB_LAST_OPENED_STORAGE_KEY]: current });
  }
}

export function registerTabLastOpenedTracking(
  queryTabs: () => Promise<Array<{ id?: number; lastAccessed?: number }>> = () =>
    browser.tabs.query({}),
): () => void {
  const onActivated = (info: { tabId: number }) => {
    void recordTabLastOpened(info.tabId);
  };
  const onRemoved = (tabId: number) => {
    void forgetTabLastOpened(tabId);
  };

  void queryTabs()
    .then((tabs) => seedTabLastOpened(tabs))
    .catch(() => {
      // Seeding is best-effort.
    });
  browser.tabs.onActivated.addListener(onActivated);
  browser.tabs.onRemoved.addListener(onRemoved);

  return () => {
    browser.tabs.onActivated.removeListener(onActivated);
    browser.tabs.onRemoved.removeListener(onRemoved);
  };
}
