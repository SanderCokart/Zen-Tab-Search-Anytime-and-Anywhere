import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { TodoStatus } from "@/shared/types";

type TodoMap = Map<number, TodoStatus>;

export interface UseTodoActionsOptions {
  setTodos: (update: TodoMap | ((current: TodoMap) => TodoMap)) => void;
}

/** Todo mutations for the row button, the context menu and the todo column. */
export function useTodoActions({ setTodos }: UseTodoActionsOptions) {
  /** Sets a tab's todo, or removes it with "none". The view updates before the background confirms. */
  const setTodo = (tabId: number, status: TodoStatus | "none") => {
    setTodos((current) => {
      const next = new Map(current);
      if (status === "none") {
        next.delete(tabId);
      } else {
        next.set(tabId, status);
      }
      return next;
    });
    void sendExtensionMessage({ type: "setTodo", tabId, status }).catch((error) =>
      debugError("Could not update todo:", error),
    );
  };

  return { setTodo };
}
