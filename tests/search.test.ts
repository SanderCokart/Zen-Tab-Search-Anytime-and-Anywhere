import { describe, expect, it } from "vitest";
import {
  buildForgeIssueEntries,
  buildSearchItems,
  filterForgeIssueEntries,
  flattenForgeNavigatorEntries,
  parseForgeNavigatorQuery,
  prioritizeCurrentTab,
  sortForgeIssueEntries,
} from "../lib/search";
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

describe("forge issue entries", () => {
  it("builds grouped issue entries from open forge tabs", () => {
    const entries = buildForgeIssueEntries([
      {
        ...tab(1),
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
      },
      {
        ...tab(2),
        title: "Add filtering",
        url: "https://gitlab.com/acme/project/-/merge_requests/7",
      },
      tab(3),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      title: "Fix search",
      projectLabel: "github.com/acme/project",
      ref: { id: "42", kind: "issue" },
    });
    expect(entries[1]).toMatchObject({
      title: "Add filtering",
      projectLabel: "gitlab.com/acme/project",
      ref: { id: "7", kind: "merge_request" },
    });
  });

  it("filters issue entries by title, project, type, or number", () => {
    const entries = buildForgeIssueEntries([
      {
        ...tab(1),
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
      },
      {
        ...tab(2),
        title: "Add filtering",
        url: "https://gitlab.com/acme/project/-/merge_requests/7",
      },
    ]);

    expect(filterForgeIssueEntries(entries, "42")).toHaveLength(1);
    expect(filterForgeIssueEntries(entries, "merge request")[0]?.ref.id).toBe("7");
    expect(filterForgeIssueEntries(entries, "gitlab")[0]?.ref.id).toBe("7");
  });

  it("sorts issue entries from recently opened to oldest", () => {
    const entries = buildForgeIssueEntries([
      {
        ...tab(1),
        title: "Older issue",
        url: "https://github.com/acme/project/issues/10",
        lastOpenedAt: 100,
      },
      {
        ...tab(2),
        title: "Newer issue",
        url: "https://github.com/acme/project/issues/2",
        lastOpenedAt: 500,
      },
    ]);

    expect(sortForgeIssueEntries(entries, "recent").map((entry) => entry.ref.id)).toEqual([
      "2",
      "10",
    ]);
    expect(sortForgeIssueEntries(entries, "old").map((entry) => entry.ref.id)).toEqual(["10", "2"]);
  });
});

describe("parseForgeNavigatorQuery", () => {
  it("treats leading # or ! as issue-navigator focus and strips them from the filter", () => {
    expect(parseForgeNavigatorQuery("#42")).toEqual({ active: true, filterQuery: "42" });
    expect(parseForgeNavigatorQuery("! 7")).toEqual({ active: true, filterQuery: "7" });
    expect(parseForgeNavigatorQuery(" #fix")).toEqual({ active: true, filterQuery: "fix" });
    expect(parseForgeNavigatorQuery("fix #42")).toEqual({
      active: false,
      filterQuery: "fix #42",
    });
  });

  it("flattens navigator entries in on-screen group order", () => {
    const entries = buildForgeIssueEntries([
      {
        ...tab(1),
        title: "Newer issue",
        url: "https://github.com/acme/project/issues/42",
        lastOpenedAt: 500,
      },
      {
        ...tab(2),
        title: "Older MR",
        url: "https://gitlab.com/acme/project/-/merge_requests/7",
        lastOpenedAt: 100,
      },
    ]);

    expect(flattenForgeNavigatorEntries(entries, "recent").map((entry) => entry.ref.id)).toEqual([
      "42",
      "7",
    ]);
  });
});
