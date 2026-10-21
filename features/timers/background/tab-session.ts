import { debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";

/**
 * Values Firefox keeps on a tab across restarts. Zen does not restore them for
 * tabs in a space that has not been opened yet, so they are one clue among
 * several, never the only way to find a tab.
 */
interface TabSessionStore {
  getTabValue(tabId: number, key: string): Promise<unknown>;
  setTabValue(tabId: number, key: string, value: unknown): Promise<void>;
  removeTabValue(tabId: number, key: string): Promise<void>;
}

function getTabSessionStore(): TabSessionStore | undefined {
  const sessions = (browser as typeof browser & { sessions?: Partial<TabSessionStore> }).sessions;
  if (!sessions?.getTabValue || !sessions.setTabValue || !sessions.removeTabValue) {
    return undefined;
  }
  return sessions as TabSessionStore;
}

export async function readTabValue(tabId: number, key: string): Promise<unknown> {
  try {
    return await getTabSessionStore()?.getTabValue(tabId, key);
  } catch {
    return undefined;
  }
}

export async function writeTabValue(tabId: number, key: string, value: unknown): Promise<void> {
  try {
    await getTabSessionStore()?.setTabValue(tabId, key, value);
  } catch (error) {
    debugWarn(`${LOG_PREFIX} Could not save a value on the tab:`, formatError(error));
  }
}

export async function removeTabValue(tabId: number, key: string): Promise<void> {
  try {
    await getTabSessionStore()?.removeTabValue(tabId, key);
  } catch {
    // The tab may already be gone.
  }
}
