import { isUsableTabId, type TabInfo, type TabTodo, type TodoStatus } from "@/shared/types";

export interface TodoTab {
  tab: TabInfo;
  status: TodoStatus;
}

/** Turns the snapshot's todo list into a lookup by tab ID. */
export function todoStatusByTabId(todos: TabTodo[]): Map<number, TodoStatus> {
  return new Map(todos.map((todo) => [todo.tabId, todo.status]));
}

/**
 * Splits the marked tabs into open todos and finished ones, keeping the order
 * the tab list already has. Tabs without a browser ID (essential tabs) can't
 * carry a todo, so they are skipped.
 */
export function groupTodoTabs(
  tabs: TabInfo[],
  statuses: Map<number, TodoStatus>,
): { todo: TodoTab[]; done: TodoTab[] } {
  const todo: TodoTab[] = [];
  const done: TodoTab[] = [];

  for (const tab of tabs) {
    if (!isUsableTabId(tab.id)) {
      continue;
    }
    const status = statuses.get(tab.id);
    if (status === "todo") {
      todo.push({ tab, status });
    } else if (status === "done") {
      done.push({ tab, status });
    }
  }

  return { todo, done };
}
