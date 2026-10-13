import { describe, expect, it } from "vitest";
import { collectTodoTabs, todoStatusByTabId } from "@/features/todos/model/todo";
import type { TabInfo } from "@/shared/types";

function tab(id: number | null, title = `Tab ${id}`): TabInfo {
  return { id, title, url: "https://example.com", favIconUrl: "", windowId: 1 };
}

describe("todo model", () => {
  it("builds a lookup from the snapshot list", () => {
    const map = todoStatusByTabId([{ tabId: 1, status: "todo" }]);
    expect(map.get(1)).toBe("todo");
    expect(map.has(3)).toBe(false);
  });

  it("collects marked tabs, keeping tab order", () => {
    const tabs = [tab(5), tab(3), tab(1), tab(2)];
    const statuses = new Map<number, "todo">([
      [1, "todo"],
      [3, "todo"],
    ]);

    expect(collectTodoTabs(tabs, statuses).map((entry) => entry.id)).toEqual([3, 1]);
  });

  it("skips tabs without a browser ID, since they cannot carry a todo", () => {
    expect(collectTodoTabs([tab(null)], new Map([[-1, "todo"]]))).toEqual([]);
  });
});
