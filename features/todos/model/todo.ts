import * as v from "valibot";
import { isUsableTabId, type TabInfo, type TabTodo, type TrafficLight } from "@/shared/types";

/** Which todos the column's "Clear" menu removes: every one, or those with one status color. */
export type TodoClearFilter = "all" | TrafficLight;

/** Turns the snapshot's todo list into a lookup by tab ID. */
export function todosByTabId(todos: TabTodo[]): Map<number, TabTodo> {
  return new Map(todos.map((todo) => [todo.tabId, todo]));
}

export const TODO_ORDER_STORAGE_KEY = "todoOrder";

/** Whatever storage holds as a list of tab IDs; anything unreadable is "no order". */
export function parseTodoOrder(value: unknown): number[] {
  return v.parse(v.fallback(v.array(v.pipe(v.number(), v.integer(), v.minValue(0))), []), value);
}

/**
 * The tabs marked as todo, in the order the tab list already has. Tabs without
 * a browser ID (essential tabs) can't carry a todo, so they are skipped.
 */
export function collectTodoTabs(tabs: TabInfo[], todos: Map<number, TabTodo>): TabInfo[] {
  return tabs.filter((tab) => isUsableTabId(tab.id) && todos.get(tab.id)?.status === "todo");
}

/**
 * Puts saved IDs first, in that order, then any remaining todo tabs in the
 * order they already had. Missing or closed IDs are skipped.
 */
export function applyTodoOrder(tabs: TabInfo[], order: readonly number[]): TabInfo[] {
  if (order.length === 0) {
    return tabs;
  }
  const byId = new Map<number, TabInfo>();
  for (const tab of tabs) {
    if (isUsableTabId(tab.id)) {
      byId.set(tab.id, tab);
    }
  }
  const seen = new Set<number>();
  const ordered: TabInfo[] = [];
  for (const id of order) {
    const tab = byId.get(id);
    if (tab && !seen.has(id)) {
      ordered.push(tab);
      seen.add(id);
    }
  }
  for (const tab of tabs) {
    const id = tab.id;
    if (isUsableTabId(id) && !seen.has(id)) {
      ordered.push(tab);
    }
  }
  return ordered;
}

/** Moves the item at `from` to `to`. Out-of-range indexes leave the list as it is. */
export function moveListItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) {
    return [...items];
  }
  next.splice(to, 0, item);
  return next;
}

/** The browser IDs of the todo tabs `filter` picks, in the column's order. */
export function todoTabIdsToClear(
  todoTabs: TabInfo[],
  statuses: Map<number, TrafficLight>,
  filter: TodoClearFilter,
): number[] {
  return todoTabs.flatMap((tab) => {
    const tabId = tab.id;
    if (!isUsableTabId(tabId)) {
      return [];
    }
    return filter === "all" || statuses.get(tabId) === filter ? [tabId] : [];
  });
}
