import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { StoredStateCache } from "@/features/forge/ui/useForgeCollapse";
import { debugError } from "@/shared/debug";
import { parseTodoOrder, TODO_ORDER_STORAGE_KEY } from "@/features/todos/model/todo";

/**
 * The user's todo-column order, kept in `storage.local`. It is not a setting
 * and is not part of the settings backup: tab IDs only last for a session.
 */
export function useTodoOrder(cache?: StoredStateCache): {
  order: readonly number[];
  setOrder: (next: readonly number[]) => void;
  loaded: boolean;
} {
  const [order, setStored] = useState<number[]>(
    () => (cache?.stored?.[TODO_ORDER_STORAGE_KEY] as number[] | undefined) ?? [],
  );
  const [loaded, setLoaded] = useState(cache?.stored?.[TODO_ORDER_STORAGE_KEY] !== undefined);
  const orderRef = useRef(order);

  const apply = useCallback(
    (next: number[]) => {
      orderRef.current = next;
      if (cache) (cache.stored ??= {})[TODO_ORDER_STORAGE_KEY] = next;
      setStored(next);
    },
    [cache],
  );

  useEffect(() => {
    let active = true;
    void browser.storage.local
      .get(TODO_ORDER_STORAGE_KEY)
      .then((stored) => {
        if (active) apply(parseTodoOrder(stored[TODO_ORDER_STORAGE_KEY]));
      })
      .catch((error) => debugError("Could not read todo order:", error))
      .finally(() => {
        if (active) setLoaded(true);
      });

    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !(TODO_ORDER_STORAGE_KEY in changes)) return;
      apply(parseTodoOrder(changes[TODO_ORDER_STORAGE_KEY]?.newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [apply]);

  const setOrder = useCallback(
    (next: readonly number[]) => {
      const ids = [...next];
      const current = orderRef.current;
      if (ids.length === current.length && ids.every((id, index) => id === current[index])) {
        return;
      }
      apply(ids);
      void browser.storage.local
        .set({ [TODO_ORDER_STORAGE_KEY]: ids })
        .catch((error) => debugError("Could not save todo order:", error));
    },
    [apply],
  );

  return { order, setOrder, loaded };
}
