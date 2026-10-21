import { describe, expect, it } from "vitest";
import { buildForgeIssueEntries } from "@/features/search/model/ranking";
import { pluralize, summarizeSearch } from "@/features/search/model/stats";
import type { TabInfo } from "@/shared/types";

function tab(id: number, url: string, extra: Partial<TabInfo> = {}): TabInfo {
  return { id, title: `Tab ${id}`, url, favIconUrl: "", windowId: 1, ...extra };
}

describe("summarizeSearch", () => {
  it("counts tabs, essentials, spaces and forge tabs per platform", () => {
    const tabs = [
      tab(1, "https://example.com"),
      tab(2, "https://github.com/acme/app/pull/7"),
      tab(3, "https://github.com/acme/app/issues/8"),
      tab(4, "https://gitlab.com/acme/app/-/merge_requests/9"),
      tab(5, "https://example.org", { essential: true }),
    ];

    expect(
      summarizeSearch({
        tabs,
        spaces: [{ id: "a", name: "Work", isActive: true }],
        forgeEntries: buildForgeIssueEntries(tabs),
        todos: 2,
        timers: 1,
      }),
    ).toEqual({ tabs: 5, essentials: 1, spaces: 1, github: 2, gitlab: 1, todos: 2, timers: 1 });
  });
});

describe("pluralize", () => {
  it("uses the singular only for one", () => {
    expect(pluralize(1, "tab")).toBe("1 tab");
    expect(pluralize(0, "tab")).toBe("0 tabs");
    expect(pluralize(3, "essential tab")).toBe("3 essential tabs");
  });
});
