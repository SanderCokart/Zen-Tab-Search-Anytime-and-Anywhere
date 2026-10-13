import { isUsableTabId, type TabInfo, type TabTodo, type TrafficLight } from "@/shared/types";

/** Turns the snapshot's todo list into a lookup by tab ID. */
export function todosByTabId(todos: TabTodo[]): Map<number, TabTodo> {
  return new Map(todos.map((todo) => [todo.tabId, todo]));
}

/**
 * The tabs marked as todo, in the order the tab list already has. Tabs without
 * a browser ID (essential tabs) can't carry a todo, so they are skipped.
 */
export function collectTodoTabs(tabs: TabInfo[], todos: Map<number, TabTodo>): TabInfo[] {
  return tabs.filter((tab) => isUsableTabId(tab.id) && todos.get(tab.id)?.status === "todo");
}

/** The traffic lights in the order the picker lists them. */
export const TRAFFIC_LIGHT_OPTIONS: { light: TrafficLight; label: string }[] = [
  { light: "red", label: "Red" },
  { light: "orange", label: "Orange" },
  { light: "green", label: "Green" },
];
