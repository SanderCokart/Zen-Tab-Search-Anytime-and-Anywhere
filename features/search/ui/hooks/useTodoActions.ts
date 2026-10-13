import { useCallback } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { TabTodo, TodoStatus, TrafficLight } from "@/shared/types";

type TodoMap = Map<number, TabTodo>;

export interface UseTodoActionsOptions {
  setTodos: (update: TodoMap | ((current: TodoMap) => TodoMap)) => void;
}

/** Todo mutations for the row buttons, the context menu and the todo column. */
export function useTodoActions({ setTodos }: UseTodoActionsOptions) {
  /**
   * Sets a tab's todo, or removes it with "none". `light` sets the traffic
   * light, "none" clears it and leaving it out keeps the current one. The view
   * updates before the background confirms.
   */
  const setTodo = useCallback(
    (tabId: number, status: TodoStatus | "none", light?: TrafficLight | "none") => {
      setTodos((current) => {
        const next = new Map(current);
        if (status === "none") {
          next.delete(tabId);
          return next;
        }
        const nextLight = light === undefined ? current.get(tabId)?.light : light;
        next.set(
          tabId,
          nextLight === undefined || nextLight === "none"
            ? { tabId, status }
            : { tabId, status, light: nextLight },
        );
        return next;
      });
      void sendExtensionMessage({
        type: "setTodo",
        tabId,
        status,
        ...(light === undefined ? {} : { light }),
      }).catch((error) => debugError("Could not update todo:", error));
    },
    [setTodos],
  );

  return { setTodo };
}
