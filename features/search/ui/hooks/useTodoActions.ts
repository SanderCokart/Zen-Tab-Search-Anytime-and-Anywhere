import { useCallback } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { TabTodo, TodoStatus } from "@/shared/types";

type TodoMap = Map<number, TabTodo>;

export interface UseTodoActionsOptions {
  setTodos: (update: TodoMap | ((current: TodoMap) => TodoMap)) => void;
}

/** Todo mutations for the row buttons, the context menu and the todo column. */
export function useTodoActions({ setTodos }: UseTodoActionsOptions) {
  /** Sets a tab's todo, or removes it with "none". The view updates before the background confirms. */
  const setTodo = useCallback(
    (tabId: number, status: TodoStatus | "none") => {
      setTodos((current) => {
        const next = new Map(current);
        if (status === "none") {
          next.delete(tabId);
        } else {
          next.set(tabId, { tabId, status });
        }
        return next;
      });
      void sendExtensionMessage({ type: "setTodo", tabId, status }).catch((error) =>
        debugError("Could not update todo:", error),
      );
    },
    [setTodos],
  );

  /** Marks every tab in `tabIds` done in one background call. */
  const clearTodos = useCallback(
    (tabIds: number[]) => {
      setTodos((current) => {
        const next = new Map(current);
        for (const tabId of tabIds) {
          next.delete(tabId);
        }
        return next;
      });
      void sendExtensionMessage({ type: "clearTodos", tabIds }).catch((error) =>
        debugError("Could not clear todos:", error),
      );
    },
    [setTodos],
  );

  return { setTodo, clearTodos };
}
