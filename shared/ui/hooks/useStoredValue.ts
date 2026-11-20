import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";

/** Outlives the component so a reopen starts from the last stored values. */
export interface StoredStateCache {
  stored?: Record<string, unknown>;
}

export interface StoredValueOptions<T> {
  /** Names the value in the log line when storage cannot be read or written. */
  label?: string;
  /** What to show until storage answers, when there is no cached value. Default: `parse(undefined)`. */
  initial?: T;
  /** Writes of an equal value are dropped. Default: `Object.is`. */
  isEqual?: (a: T, b: T) => boolean;
}

export interface StoredValue<T> {
  value: T;
  /** The latest value, current even between renders, so two sets in one tick compose. */
  latest: () => T;
  /** Shows `next` at once and writes it to `storage.local`. */
  set: (next: T) => void;
  /** False until storage has been read (or the cache already held a value). */
  loaded: boolean;
}

/**
 * One value kept under `key` in `storage.local`: seeded from `cache`, read on
 * mount, kept in step with changes made elsewhere, and written back by `set`.
 * `parse` turns whatever storage holds into a `T`; it must accept `undefined`.
 */
export function useStoredValue<T>(
  key: string,
  parse: (raw: unknown) => T,
  cache?: StoredStateCache,
  options: StoredValueOptions<T> = {},
): StoredValue<T> {
  const { label = key, isEqual = Object.is } = options;
  const [value, setValue] = useState<T>(() => {
    const cached = cache?.stored?.[key];
    if (cached !== undefined) return cached as T;
    return "initial" in options ? (options.initial as T) : parse(undefined);
  });
  const [loaded, setLoaded] = useState(cache?.stored?.[key] !== undefined);
  const latestRef = useRef(value);

  const apply = useCallback(
    (next: T) => {
      latestRef.current = next;
      if (cache) (cache.stored ??= {})[key] = next;
      setValue(next);
    },
    [cache, key],
  );

  useEffect(() => {
    let active = true;
    void browser.storage.local
      .get(key)
      .then((stored) => {
        if (active) apply(parse(stored[key]));
      })
      .catch((error) => debugError(`Could not read ${label}:`, error))
      .finally(() => {
        if (active) setLoaded(true);
      });

    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !(key in changes)) return;
      apply(parse(changes[key]?.newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [apply, key]);

  const set = useCallback(
    (next: T) => {
      if (isEqual(next, latestRef.current)) return;
      apply(next);
      void browser.storage.local
        .set({ [key]: next })
        .catch((error) => debugError(`Could not save ${label}:`, error));
    },
    [apply, key],
  );

  const latest = useCallback(() => latestRef.current, []);
  return { value, latest, set, loaded };
}
