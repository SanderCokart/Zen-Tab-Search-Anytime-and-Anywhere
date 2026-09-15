import { isExtensionPageUrl } from "../urls";

export function isUsableBrowserTabId(tabId: number | undefined, url?: string): boolean {
  return Number.isInteger(tabId) && tabId! >= 0 && !isExtensionPageUrl(url);
}

/** Zen experiment APIs accept -1 when no extension tab can anchor the browser window lookup. */
export function zenAnchorTabId(tabId?: number): number {
  if (Number.isInteger(tabId) && tabId! >= 0) {
    return tabId!;
  }
  return -1;
}

export async function resolveAnchorTabId(preferredTabId?: number): Promise<number | undefined> {
  if (Number.isInteger(preferredTabId) && preferredTabId! >= 0) {
    try {
      const preferred = await browser.tabs.get(preferredTabId!);
      if (isUsableBrowserTabId(preferred.id, preferred.url)) {
        return preferred.id;
      }
    } catch {
      // Preferred tab may already be gone.
    }
  }

  const queries: Array<Record<string, boolean>> = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
    { active: true },
    {},
  ];

  for (const query of queries) {
    const tabs = await browser.tabs.query(query);
    const tab = tabs.find((candidate) => isUsableBrowserTabId(candidate.id, candidate.url));
    if (tab?.id !== undefined) {
      return tab.id;
    }
  }

  return undefined;
}
