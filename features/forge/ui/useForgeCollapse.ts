import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  FORGE_COLLAPSED_STORAGE_KEY,
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
}

export type ForgeCollapseState = CollapseState;

/**
 * Which navigator groups are collapsed, kept in `storage.local` so a collapsed
 * project stays collapsed between visits. It is not a setting and is not part
 * of the settings backup.
 */
export function useForgeCollapse(): ForgeCollapseState {
  return useStoredCollapse(FORGE_COLLAPSED_STORAGE_KEY);
}

/** The same, for any list of collapsed keys kept under `storageKey` in `storage.local`. */
export function useStoredCollapse(storageKey: string): CollapseState {
  const [keys, setKeys] = useState<string[]>([]);
  // The latest list, so two toggles in one tick compose instead of overwriting.
  const keysRef = useRef(keys);

  const apply = useCallback((next: string[]) => {
    keysRef.current = next;
    setKeys(next);
  }, []);

  useEffect(() => {
    let active = true;
    void browser.storage.local
      .get(storageKey)
      .then((stored) => {
        if (active) apply(parseCollapsedGroups(stored[storageKey]));
      })
      .catch((error) => debugError("Could not read collapsed groups:", error));

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

  const collapsed = useMemo(() => new Set(keys), [keys]);
  return { collapsed, toggle, setCollapsed };
}
