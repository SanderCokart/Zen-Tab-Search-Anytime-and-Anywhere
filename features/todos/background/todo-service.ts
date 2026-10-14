import * as v from "valibot";
import type { TabTodo, TodoStatus } from "@/shared/types";
import { TODO_STATUSES } from "@/shared/messaging/protocol";
import { createTabSessionValues } from "@/shared/tab-session-values";

const todoStatusSchema = v.picklist(TODO_STATUSES);

/**
 * A todo is saved as its bare status. Builds from before status colors moved
 * out of todos saved `{ status, light }`; those still read, without the light.
 */
const savedTodoSchema = v.union([
  todoStatusSchema,
  v.pipe(
    v.object({ status: todoStatusSchema }),
    v.transform((saved) => saved.status),
  ),
]);

/** Tab todos, kept in each tab's session data. */
export function createTodoService() {
  const values = createTabSessionValues<TodoStatus>("tabTodo", savedTodoSchema);

  return {
    /** Sets a tab's todo, or removes it with "none". */
    setTodo: (tabId: number, status: TodoStatus | "none"): Promise<void> =>
      values.set(tabId, status === "none" ? undefined : status),
    /** The todo for each of these tabs that has one. */
    getTodos: async (tabIds: number[]): Promise<TabTodo[]> =>
      (await values.get(tabIds)).map(({ tabId, value }) => ({ tabId, status: value })),
    hydrate: values.hydrate,
    forget: values.forget,
  };
}

export type TodoService = ReturnType<typeof createTodoService>;
