import { describe, expect, it } from "vitest";
import { groupTodoTabs, todoStatusByTabId } from "@/features/todos/model/todo";
import type { TabInfo } from "@/shared/types";

function tab(id: number | null, title = `Tab ${id}`): TabInfo {
  return { id, title, url: "https://example.com", favIconUrl: "", windowId: 1 };
}

describe("todo model", () => {
  it("builds a lookup from the snapshot list", () => {
    const map = todoStatusByTabId([
      { tabId: 1, status: "todo" },
      { tabId: 2, status: "done" },
    ]);
    expect(map.get(1)).toBe("todo");
    expect(map.get(2)).toBe("done");
    expect(map.has(3)).toBe(false);
  });

  it("splits marked tabs into todo and done, keeping tab order", () => {
    const tabs = [tab(5), tab(1), tab(3), tab(2)];
    const statuses = new Map<number, "todo" | "done">([
      [1, "todo"],
      [2, "done"],
      [3, "todo"],
    ]);

    const grouped = groupTodoTabs(tabs, statuses);

    expect(grouped.todo.map((entry) => entry.tab.id)).toEqual([1, 3]);
    expect(grouped.done.map((entry) => entry.tab.id)).toEqual([2]);
  });

  it("skips tabs without a browser ID, since they cannot carry a todo", () => {
    const grouped = groupTodoTabs([tab(null)], new Map([[-1, "todo"]]));
    expect(grouped).toEqual({ todo: [], done: [] });
  });
});
