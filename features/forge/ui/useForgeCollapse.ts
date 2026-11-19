import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  FORGE_COLLAPSED_STORAGE_KEY,
  MAX_COLLAPSED_GROUPS,
  parseCollapsedGroups,
  toggleCollapsedKey,
} from "@/features/forge/model/forge-collapse";
import { debugError } from "@/shared/debug";

export interface CollapseState {
  /** Keys of the collapsed groups. */
  collapsed: ReadonlySet<string>;
  /** Flips one group and writes the result to storage. */
  toggle: (key: string) => void;
  /** Collapses or expands one group; a no-op when it is already so. */
  setCollapsed: (key: string, collapsed: boolean) => void;
  /** Replaces the whole set: every key collapsed, or none. */
  setKeys: (keys: readonly string[]) => void;
  /** False until the stored list has been read. */
  loaded: boolean;
}

/** Outlives the component so a reopen starts from the last stored values. */
export interface StoredStateCache {
  stored?: Record<string, unknown>;
}

export type ForgeCollapseState = CollapseState;

/**
 * Which navigator groups are collapsed, kept in `storage.local` so a collapsed
 * project stays collapsed between visits. It is not a setting and is not part
 * of the settings backup.
 */
export function useForgeCollapse(cache?: StoredStateCache): ForgeCollapseState {
  return useStoredCollapse(FORGE_COLLAPSED_STORAGE_KEY, cache);
}

/** The same, for any list of collapsed keys kept under `storageKey` in `storage.local`. */
export function useStoredCollapse(storageKey: string, cache?: StoredStateCache): CollapseState {
  const [keys, setStoredKeys] = useState<string[]>(
    () => (cache?.stored?.[storageKey] as string[] | undefined) ?? [],
  );
  const [loaded, setLoaded] = useState(cache?.stored?.[storageKey] !== undefined);
  // The latest list, so two toggles in one tick compose instead of overwriting.
  const keysRef = useRef(keys);

  const apply = useCallback(
    (next: string[]) => {
      keysRef.current = next;
      if (cache) (cache.stored ??= {})[storageKey] = next;
      setStoredKeys(next);
    },
    [cache, storageKey],
  );

  useEffect(() => {
    let active = true;
    void browser.storage.local
      .get(storageKey)
      .then((stored) => {
        if (active) apply(parseCollapsedGroups(stored[storageKey]));
      })
      .catch((error) => debugError("Could not read collapsed groups:", error))
      .finally(() => {
        if (active) setLoaded(true);
      });

    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !(storageKey in changes)) return;
      apply(parseCollapsedGroups(changes[storageKey]?.newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [apply, storageKey]);

  const write = useCallback(
    (next: string[]) => {
      apply(next);
      void browser.storage.local
        .set({ [storageKey]: next })
        .catch((error) => debugError("Could not save collapsed groups:", error));
    },
    [apply, storageKey],
  );

  const toggle = useCallback(
    (key: string) => write(toggleCollapsedKey(keysRef.current, key)),
    [write],
  );

  const setCollapsed = useCallback(
    (key: string, collapsed: boolean) => {
      if (keysRef.current.includes(key) === collapsed) return;
      write(toggleCollapsedKey(keysRef.current, key));
    },
    [write],
  );

  const setKeys = useCallback(
    (next: readonly string[]) => {
      const limited = [...next].slice(-MAX_COLLAPSED_GROUPS);
      const current = keysRef.current;
      if (
        limited.length === current.length &&
        limited.every((key, index) => key === current[index])
      ) {
        return;
      }
      write(limited);
    },
    [write],
  );

  const collapsed = useMemo(() => new Set(keys), [keys]);
  return { collapsed, toggle, setCollapsed, setKeys, loaded };
}
