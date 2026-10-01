import { isExtensionPageUrl } from "@/shared/urls";
import { isUsableTabId } from "@/shared/types";

export function isUsableBrowserTabId(tabId: number | undefined, url?: string): boolean {
  return isUsableTabId(tabId) && !isExtensionPageUrl(url);
}

export function isUsableWindowId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Zen experiment APIs accept -1 when no extension tab can anchor the browser window lookup. */
export function zenAnchorTabId(tabId?: number): number {
  return isUsableTabId(tabId) ? tabId : -1;
}

async function usableTabId(tabId?: number): Promise<number | undefined> {
  if (!isUsableTabId(tabId)) {
    return undefined;
  }

  try {
    const tab = await browser.tabs.get(tabId);
    if (isUsableBrowserTabId(tab.id, tab.url)) {
      return tab.id;
    }
  } catch {
    // Preferred tab may already be gone.
  }

  return undefined;
}

type AnchorTabQuery = {
  active?: boolean;
  lastFocusedWindow?: boolean;
  currentWindow?: boolean;
  windowId?: number;
};

async function firstUsableTab(query: AnchorTabQuery): Promise<number | undefined> {
  try {
    const tabs = await browser.tabs.query(query);
    const tab = tabs.find((candidate) => isUsableBrowserTabId(candidate.id, candidate.url));
    if (tab?.id !== undefined) {
      return tab.id;
    }
  } catch {
    // Query filters such as windowTypes are not available in every host.
  }

  return undefined;
}

async function lastFocusedNormalWindowId(): Promise<number | undefined> {
  try {
    const win = await browser.windows.getLastFocused({ windowTypes: ["normal"] });
    if (isUsableWindowId(win?.id) && win.type !== "popup") {
      return win.id;
    }
  } catch {
    // Tests and some hosts omit getLastFocused.
  }

  return undefined;
}

/**
 * Find a real browser tab that identifies the Zen window the user is in.
 *
 * Never falls back to "any active tab" — that is the first window in
 * enumeration order, which is how a second Zen instance kept seeing the first
 * instance's current tab, snapshot, and rename target.
 */
export async function resolveAnchorTabId(preferredTabId?: number): Promise<number | undefined> {
  const fromPreferred = await usableTabId(preferredTabId);
  if (fromPreferred !== undefined) {
    return fromPreferred;
  }

  const windowId = await lastFocusedNormalWindowId();
  if (windowId !== undefined) {
    const fromWindow = await firstUsableTab({ active: true, windowId });
    if (fromWindow !== undefined) {
      return fromWindow;
    }
  }

  for (const query of [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
  ] as const) {
    const tabId = await firstUsableTab(query);
    if (tabId !== undefined) {
      return tabId;
    }
  }

  return undefined;
}
