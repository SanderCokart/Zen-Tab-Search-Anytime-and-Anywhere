import { isUsableTabId, type TabInfo, type TabTodo } from "@/shared/types";

/** Turns the snapshot's todo list into a lookup by tab ID. */
export function todosByTabId(todos: TabTodo[]): Map<number, TabTodo> {
  return new Map(todos.map((todo) => [todo.tabId, todo]));
}

/**
 * The tabs marked as todo, in the order the tab list already has, except that
 * the current tab goes first when it is one. Tabs without a browser ID
 * (essential tabs) can't carry a todo, so they are skipped.
 */
export function collectTodoTabs(tabs: TabInfo[], todos: Map<number, TabTodo>): TabInfo[] {
  const todoTabs = tabs.filter(
    (tab) => isUsableTabId(tab.id) && todos.get(tab.id)?.status === "todo",
  );
  const currentIndex = todoTabs.findIndex((tab) => tab.active === true);
  if (currentIndex <= 0) {
    return todoTabs;
  }
  return [todoTabs[currentIndex]!, ...todoTabs.filter((_, index) => index !== currentIndex)];
}
