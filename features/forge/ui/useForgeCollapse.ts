import { useCallback, useMemo } from "preact/hooks";
import {
  FORGE_COLLAPSED_STORAGE_KEY,
  MAX_COLLAPSED_GROUPS,
  parseCollapsedGroups,
  toggleCollapsedKey,
} from "@/features/forge/model/forge-collapse";
import { type StoredStateCache, useStoredValue } from "@/shared/ui/hooks/useStoredValue";

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

export type ForgeCollapseState = CollapseState;

/**
 * Which navigator groups are collapsed, kept in `storage.local` so a collapsed
 * project stays collapsed between visits. It is not a setting and is not part
 * of the settings backup.
 */
export function useForgeCollapse(cache?: StoredStateCache): ForgeCollapseState {
  return useStoredCollapse(FORGE_COLLAPSED_STORAGE_KEY, cache);
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** The same, for any list of collapsed keys kept under `storageKey` in `storage.local`. */
export function useStoredCollapse(storageKey: string, cache?: StoredStateCache): CollapseState {
  const {
    value: keys,
    latest,
    set,
    loaded,
  } = useStoredValue<readonly string[]>(storageKey, parseCollapsedGroups, cache, {
    label: "collapsed groups",
    isEqual: sameKeys,
  });

  // `latest` is read at call time, so two toggles in one tick compose.
  const toggle = useCallback(
    (key: string) => set(toggleCollapsedKey(latest(), key)),
    [latest, set],
  );

  const setCollapsed = useCallback(
    (key: string, collapsed: boolean) => {
      if (latest().includes(key) === collapsed) return;
      set(toggleCollapsedKey(latest(), key));
    },
    [latest, set],
  );

  const setKeys = useCallback(
    (next: readonly string[]) => set([...next].slice(-MAX_COLLAPSED_GROUPS)),
    [set],
  );

  const collapsed = useMemo(() => new Set(keys), [keys]);
  return { collapsed, toggle, setCollapsed, setKeys, loaded };
}
