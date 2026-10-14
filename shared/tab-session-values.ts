import * as v from "valibot";
import { debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { isUsableTabId } from "@/shared/types";

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

/**
 * One value per tab, kept in that tab's session data under `key`, like a timer.
 * Session data survives a Zen restart with the tab and disappears when the tab
 * closes, so nothing needs cleaning up. Without the sessions API the values are
 * kept in memory and last only until the browser restarts.
 *
 * `schema` parses what was saved; anything it rejects reads as no value.
 */
export function createTabSessionValues<T>(key: string, schema: v.GenericSchema<unknown, T>) {
  const memory = new Map<number, T>();
  const hydrated = new Set<number>();

  /** Reads the saved value of each tab not read yet. Session reads happen once per tab. */
  async function hydrate(tabIds: number[]): Promise<void> {
    const missing = tabIds.filter((tabId) => !hydrated.has(tabId));
    if (missing.length === 0) {
      return;
    }

    await Promise.all(
      missing.map(async (tabId) => {
        try {
          const saved = await getTabSessionStore()?.getTabValue(tabId, key);
          const parsed = v.safeParse(schema, saved);
          // A write that landed while the read was in flight is newer than the session.
          if (parsed.success && !hydrated.has(tabId)) {
            memory.set(tabId, parsed.output);
          }
        } catch {
          // The tab may already be gone; keep whatever is already in memory.
        }
        hydrated.add(tabId);
      }),
    );
  }

  /** Sets a tab's value, or removes it with `undefined`. */
  async function set(tabId: number, value: T | undefined): Promise<void> {
    if (!isUsableTabId(tabId)) {
      throw new Error("Invalid tab ID.");
    }

    hydrated.add(tabId);
    if (value === undefined) {
      memory.delete(tabId);
      try {
        await getTabSessionStore()?.removeTabValue(tabId, key);
      } catch {
        // The tab may already be gone.
      }
      return;
    }

    memory.set(tabId, value);
    try {
      await getTabSessionStore()?.setTabValue(tabId, key, value);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not persist ${key} to the tab session:`, formatError(error));
    }
  }

  /** The value of each of these tabs that has one, in the order given. */
  async function get(tabIds: number[]): Promise<{ tabId: number; value: T }[]> {
    await hydrate(tabIds);
    return tabIds.flatMap((tabId) => {
      const value = memory.get(tabId);
      return value === undefined ? [] : [{ tabId, value }];
    });
  }

  /** Drops the in-memory copy when a tab closes. Session data goes with the tab. */
  function forget(tabId: number): void {
    memory.delete(tabId);
    hydrated.delete(tabId);
  }

  return { hydrate, set, get, forget };
}
