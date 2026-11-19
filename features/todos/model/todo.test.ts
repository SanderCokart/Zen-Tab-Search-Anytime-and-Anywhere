import { describe, expect, it } from "vitest";
import {
  applyTodoOrder,
  collectTodoTabs,
  moveListItem,
  parseTodoOrder,
  todoTabIdsToClear,
  todosByTabId,
} from "@/features/todos/model/todo";
import type { TabInfo, TabTodo, TrafficLight } from "@/shared/types";

function tab(id: number | null, title = `Tab ${id}`): TabInfo {
  return { id, title, url: "https://example.com", favIconUrl: "", windowId: 1 };
}

describe("todo model", () => {
  it("builds a lookup from the snapshot list", () => {
    const map = todosByTabId([{ tabId: 1, status: "todo" }]);
    expect(map.get(1)?.status).toBe("todo");
    expect(map.has(3)).toBe(false);
  });

  it("collects marked tabs, keeping tab order", () => {
    const tabs = [tab(5), tab(3), tab(1), tab(2)];
    const todos = todosByTabId([
      { tabId: 1, status: "todo" },
      { tabId: 3, status: "todo" },
    ]);

    expect(collectTodoTabs(tabs, todos).map((entry) => entry.id)).toEqual([3, 1]);
  });

  it("leaves the current tab where it sits when it is a todo", () => {
    const tabs = [tab(5), tab(3), { ...tab(1), active: true }, tab(2)];
    const todos = todosByTabId([
      { tabId: 1, status: "todo" },
      { tabId: 2, status: "todo" },
      { tabId: 3, status: "todo" },
    ]);

    expect(collectTodoTabs(tabs, todos).map((entry) => entry.id)).toEqual([3, 1, 2]);
  });

  it("applies a saved order, then leftover tabs in list order", () => {
    const tabs = [tab(1), tab(2), tab(3)];
    expect(applyTodoOrder(tabs, [3, 1]).map((entry) => entry.id)).toEqual([3, 1, 2]);
    expect(applyTodoOrder(tabs, [9, 2]).map((entry) => entry.id)).toEqual([2, 1, 3]);
    expect(applyTodoOrder(tabs, []).map((entry) => entry.id)).toEqual([1, 2, 3]);
  });

  it("moves an item in a list, and ignores indexes that are out of range", () => {
    expect(moveListItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveListItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveListItem([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
    expect(moveListItem([1, 2, 3], -1, 0)).toEqual([1, 2, 3]);
    expect(moveListItem([1, 2, 3], 0, 9)).toEqual([1, 2, 3]);
  });

  it("reads a saved todo order, and treats junk as none", () => {
    expect(parseTodoOrder([3, 1, 2])).toEqual([3, 1, 2]);
    expect(parseTodoOrder(["3"])).toEqual([]);
    expect(parseTodoOrder(undefined)).toEqual([]);
  });

  it("keeps tab order when the current tab is not a todo", () => {
    const tabs = [tab(3), { ...tab(1), active: true }, tab(2)];
    const todos = todosByTabId([
      { tabId: 2, status: "todo" },
      { tabId: 3, status: "todo" },
    ]);

    expect(collectTodoTabs(tabs, todos).map((entry) => entry.id)).toEqual([3, 2]);
  });

  it("skips tabs without a browser ID, since they cannot carry a todo", () => {
    const todos = new Map<number, TabTodo>([[-1, { tabId: -1, status: "todo" }]]);
    expect(collectTodoTabs([tab(null)], todos)).toEqual([]);
  });

  it("picks every todo tab to clear, or only those with one status color", () => {
    const tabs = [tab(1), tab(2), tab(3), tab(null)];
    const statuses = new Map<number, TrafficLight>([
      [1, "red"],
      [3, "red"],
      [2, "green"],
    ]);
    expect(todoTabIdsToClear(tabs, statuses, "all")).toEqual([1, 2, 3]);
    expect(todoTabIdsToClear(tabs, statuses, "red")).toEqual([1, 3]);
    expect(todoTabIdsToClear(tabs, statuses, "orange")).toEqual([]);
  });
});
