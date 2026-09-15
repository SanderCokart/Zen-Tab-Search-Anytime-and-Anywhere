import { describe, expect, it } from "vitest";
import { buildSearchItems, prioritizeCurrentTab } from "../lib/search";
import type { TabInfo } from "../lib/types";

function tab(id: number, active = false): TabInfo {
  return {
    id,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    favIconUrl: "",
    windowId: 1,
    active,
  };
}

describe("prioritizeCurrentTab", () => {
  it("moves the current tab to the top", () => {
    const items = buildSearchItems([tab(1), tab(2), tab(3)], []);
    const ordered = prioritizeCurrentTab(items, 3);
    expect(ordered[0]).toMatchObject({ kind: "tab", data: { id: 3 } });
    expect(ordered.map((item) => (item.kind === "tab" ? item.data.id : item.data.id))).toEqual([
      3, 1, 2,
    ]);
  });

  it("uses the active flag when no id is given", () => {
    const items = buildSearchItems([tab(1), tab(2, true), tab(3)], []);
    const ordered = prioritizeCurrentTab(items);
    expect(ordered[0]).toMatchObject({ kind: "tab", data: { id: 2 } });
  });
});
