import { parseTodoOrder, TODO_ORDER_STORAGE_KEY } from "@/features/todos/model/todo";
import { type StoredStateCache, useStoredValue } from "@/shared/ui/hooks/useStoredValue";

function sameOrder(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * The user's todo-column order, kept in `storage.local`. It is not a setting
 * and is not part of the settings backup: tab IDs only last for a session.
 */
export function useTodoOrder(cache?: StoredStateCache): {
  order: readonly number[];
  setOrder: (next: readonly number[]) => void;
  loaded: boolean;
} {
  const { value, set, loaded } = useStoredValue<readonly number[]>(
    TODO_ORDER_STORAGE_KEY,
    parseTodoOrder,
    cache,
    { label: "todo order", isEqual: sameOrder },
  );
  return { order: value, setOrder: (next) => set([...next]), loaded };
}
