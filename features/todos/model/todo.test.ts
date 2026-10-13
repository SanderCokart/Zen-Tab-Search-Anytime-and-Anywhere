import { describe, expect, it } from "vitest";
import { collectTodoTabs, todosByTabId } from "@/features/todos/model/todo";
import type { TabInfo, TabTodo } from "@/shared/types";

function tab(id: number | null, title = `Tab ${id}`): TabInfo {
  return { id, title, url: "https://example.com", favIconUrl: "", windowId: 1 };
}

describe("todo model", () => {
  it("builds a lookup from the snapshot list, keeping each traffic light", () => {
    const map = todosByTabId([
      { tabId: 1, status: "todo" },
      { tabId: 2, status: "todo", light: "orange" },
    ]);
    expect(map.get(1)?.status).toBe("todo");
    expect(map.get(1)?.light).toBeUndefined();
    expect(map.get(2)?.light).toBe("orange");
    expect(map.has(3)).toBe(false);
  });

  it("collects marked tabs, keeping tab order", () => {
    const tabs = [tab(5), tab(3), tab(1), tab(2)];
    const todos = todosByTabId([
      { tabId: 1, status: "todo" },
      { tabId: 3, status: "todo", light: "red" },
    ]);

    expect(collectTodoTabs(tabs, todos).map((entry) => entry.id)).toEqual([3, 1]);
  });

  it("skips tabs without a browser ID, since they cannot carry a todo", () => {
    const todos = new Map<number, TabTodo>([[-1, { tabId: -1, status: "todo" }]]);
    expect(collectTodoTabs([tab(null)], todos)).toEqual([]);
  });
});
