import { isUsableTabId, type TabInfo, type TabTodo, type TodoStatus } from "@/shared/types";

/** Turns the snapshot's todo list into a lookup by tab ID. */
export function todoStatusByTabId(todos: TabTodo[]): Map<number, TodoStatus> {
  return new Map(todos.map((todo) => [todo.tabId, todo.status]));
}

/**
 * The tabs marked as todo, in the order the tab list already has. Tabs without
 * a browser ID (essential tabs) can't carry a todo, so they are skipped.
 */
export function collectTodoTabs(tabs: TabInfo[], statuses: Map<number, TodoStatus>): TabInfo[] {
  return tabs.filter((tab) => isUsableTabId(tab.id) && statuses.get(tab.id) === "todo");
}
