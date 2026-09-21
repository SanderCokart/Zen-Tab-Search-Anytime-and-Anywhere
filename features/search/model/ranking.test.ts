import { describe, expect, it } from "vitest";
import {
  bestForgeNavigatorIndex,
  buildForgeIssueEntries,
  buildSearchItems,
  countExactQueryWords,
  excludePinnedSearchSources,
  filterForgeIssueEntries,
  filterSearchItems,
  flattenForgeNavigatorEntries,
  fuzzyMatchWithScore,
  groupSearchItems,
  parseForgeNavigatorQuery,
  prioritizeCurrentTab,
  rankForgeIssueEntries,
  sortForgeIssueEntries,
} from "@/features/search/model/ranking";
import type { SearchItem, TabInfo } from "@/shared/types";

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

describe("excludePinnedSearchSources", () => {
  const spaces = [{ id: "space-a", name: "Work", isActive: false }];

  it("drops spaces and essential tabs independently", () => {
    const tabs = [tab(1), { ...tab(2), essential: true }];

    expect(
      excludePinnedSearchSources(tabs, spaces, {
        excludeSpaces: true,
        excludeEssentials: false,
      }),
    ).toEqual({
      tabs,
      spaces: [],
    });
    expect(
      excludePinnedSearchSources(tabs, spaces, {
        excludeSpaces: false,
        excludeEssentials: true,
      }),
    ).toEqual({
      tabs: [tabs[0]],
      spaces,
    });
  });

  it("keeps both sections when neither flag is set", () => {
    const tabs = [tab(1), { ...tab(2), essential: true }];
    expect(
      excludePinnedSearchSources(tabs, spaces, {
        excludeSpaces: false,
        excludeEssentials: false,
      }),
    ).toEqual({
      tabs,
      spaces,
    });
  });
});

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

  it("keeps spaces and essential tabs above the current tab", () => {
    const items = buildSearchItems(
      [tab(1), { ...tab(2, true), essential: true }, tab(3)],
      [{ id: "space-a", name: "Work", isActive: true }],
    );
    const ordered = prioritizeCurrentTab(items, 3);
    expect(
      ordered.map((item) =>
        item.kind === "space" ? item.data.id : `${item.data.essential ? "e" : "t"}:${item.data.id}`,
      ),
    ).toEqual(["space-a", "e:2", "t:3", "t:1"]);
  });

  it("keeps an essential current tab with the other pinned items", () => {
    const items = buildSearchItems(
      [tab(1), { ...tab(2, true), essential: true }],
      [{ id: "space-a", name: "Work", isActive: false }],
    );
    const ordered = prioritizeCurrentTab(items, 2);
    expect(
      ordered.map((item) =>
        item.kind === "space" ? item.data.id : `${item.data.essential ? "e" : "t"}:${item.data.id}`,
      ),
    ).toEqual(["space-a", "e:2", "t:1"]);
  });
});

describe("filterSearchItems", () => {
  it("ranks exact whole-word matches before fuzzy matches", () => {
    const items: SearchItem[] = buildSearchItems(
      [
        { ...tab(1), title: "Epic browser tab" },
        { ...tab(2), title: "Ephemeral notes" },
      ],
      [],
    );

    const filtered = filterSearchItems(items, "Epic");

    expect(filtered.map((item) => (item.kind === "tab" ? item.data.id : item.data.id))).toEqual([
      1,
    ]);
  });

  it("does not keep unrelated tabs for a follow-up query", () => {
    const items: SearchItem[] = buildSearchItems(
      [
        {
          ...tab(1),
          title: "Free, collaborative whiteboard · Hand-drawn look",
          url: "https://excalidraw.com",
        },
        {
          ...tab(2),
          title: "In Progress",
          customLabel: "In Progress",
          url: "https://gitlab.com/acme/project/-/merge_requests/80",
          workspaceName: "MR",
          folderName: "Work",
        },
        {
          ...tab(3),
          title: 'ISSUE: #12 - Follow-up of "Empty search state"',
          url: "https://gitlab.com/acme/project/-/issues/12",
        },
      ],
      [],
    );

    const filtered = filterSearchItems(items, "Follow");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ kind: "tab", data: { id: 3 } });
  });

  it("matches the custom Zen label and the original page title", () => {
    const items: SearchItem[] = buildSearchItems(
      [
        {
          ...tab(1),
          title: "Follow-up of empty search state",
          customLabel: "In Progress",
        },
      ],
      [],
    );

    expect(filterSearchItems(items, "Progress")).toMatchObject([{ data: { id: 1 } }]);
    expect(filterSearchItems(items, "Follow")).toMatchObject([{ data: { id: 1 } }]);
    expect(filterSearchItems(items, "progress follow")).toMatchObject([{ data: { id: 1 } }]);
  });
});

describe("fuzzyMatchWithScore", () => {
  it("matches word prefixes and rejects letter-subsequence hits", () => {
    expect(fuzzyMatchWithScore("Follow-up of empty search state", "follow").matches).toBe(true);
    expect(fuzzyMatchWithScore("In Progress", "follow").matches).toBe(false);
    expect(fuzzyMatchWithScore("Free, collaborative whiteboard", "follow").matches).toBe(false);
    expect(
      fuzzyMatchWithScore("https://gitlab.com/acme/project/-/merge_requests/80", "follow").matches,
    ).toBe(false);
  });
});

describe("groupSearchItems", () => {
  it("groups folder tabs by folder without changing group order", () => {
    const items = buildSearchItems(
      [
        { ...tab(1), folderId: "folder-a", folderName: "Projects" },
        { ...tab(2) },
        { ...tab(3), folderId: "folder-a", folderName: "Projects" },
      ],
      [],
    );

    expect(groupSearchItems(items).map((group) => [group.folderName, group.items.length])).toEqual([
      ["Projects", 2],
      [undefined, 1],
    ]);
  });

  it("keeps nested folder levels in the group tree", () => {
    const items = buildSearchItems(
      [
        {
          ...tab(1),
          folderPath: [
            { id: "folder-a", name: "Projects" },
            { id: "folder-b", name: "Client A" },
          ],
        },
      ],
      [],
    );

    const groups = groupSearchItems(items);
    expect(groups[0]).toMatchObject({
      folderName: "Projects",
      items: [],
      children: [{ folderName: "Client A", items: [{ data: { id: 1 } }] }],
    });
  });

  it("can flatten folders or keep only top-level folders", () => {
    const items = buildSearchItems(
      [
        {
          ...tab(1),
          folderPath: [
            { id: "folder-a", name: "Projects" },
            { id: "folder-b", name: "Client A" },
          ],
        },
      ],
      [],
    );

    expect(groupSearchItems(items, { groupFolders: false })[0]?.folderId).toBeUndefined();
    expect(groupSearchItems(items, { groupSubfolders: false })[0]?.children).toEqual([]);
  });

  it("keeps spaces and essential tabs above folder groups", () => {
    const items = buildSearchItems(
      [
        { ...tab(1), folderId: "folder-a", folderName: "Projects" },
        { ...tab(2), essential: true, folderId: "folder-a", folderName: "Projects" },
      ],
      [{ id: "space-a", name: "Work", isActive: true }],
    );
    const grouped = groupSearchItems([items[1]!, items[2]!, items[0]!]);

    expect(grouped.map((group) => group.folderName)).toEqual([undefined, "Projects"]);
    expect(grouped[0]?.items.map((item) => item.kind)).toEqual(["space", "tab"]);
    expect(grouped[0]?.items[1]).toMatchObject({ data: { id: 2, essential: true } });
    expect(
      grouped[1]?.items.map((item) => (item.kind === "tab" ? item.data.id : item.data.id)),
    ).toEqual([1]);
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

  it("matches a renamed issue by both its custom label and original title", () => {
    const entries = buildForgeIssueEntries([
      {
        ...tab(1),
        title: "Follow-up of empty search state · Issue #10 · acme/project",
        customLabel: "Epic",
        url: "https://github.com/acme/project/issues/10",
      },
    ]);

    expect(filterForgeIssueEntries(entries, "Epic")[0]?.ref.id).toBe("10");
    expect(filterForgeIssueEntries(entries, "Follow")[0]?.ref.id).toBe("10");
    expect(filterForgeIssueEntries(entries, "epic empty")[0]?.ref.id).toBe("10");
  });

  it("ranks a custom-labeled exact issue match above a more recently opened issue", () => {
    const entries = buildForgeIssueEntries([
      {
        ...tab(1),
        title: "Unrelated GitHub title · Issue #10 · acme/project",
        customLabel: "Epic",
        url: "https://github.com/acme/project/issues/10",
        lastOpenedAt: 100,
      },
      {
        ...tab(2),
        title: "Newer issue · Issue #2 · acme/project",
        url: "https://github.com/acme/project/issues/2",
        lastOpenedAt: 500,
      },
    ]);

    const ranked = rankForgeIssueEntries(entries, "Epic");
    expect(ranked[0]?.entry.ref.id).toBe("10");
    expect(ranked[0]?.direct).toBe(true);

    const visual = flattenForgeNavigatorEntries(entries, "recent");
    expect(visual[0]?.ref.id).toBe("2");
    expect(bestForgeNavigatorIndex(visual, ranked)).toBe(
      visual.findIndex((entry) => entry.ref.id === "10"),
    );
    expect(bestForgeNavigatorIndex(visual, ranked, "Epic")).toBe(
      visual.findIndex((entry) => entry.ref.id === "10"),
    );
  });

  it("selects the issue that matches the most query words", () => {
    const entries = buildForgeIssueEntries([
      {
        ...tab(1),
        title: "Dark mode",
        url: "https://github.com/acme/project/issues/1",
        lastOpenedAt: 500,
      },
      {
        ...tab(2),
        title: "Dark mode sidebar toggle",
        url: "https://github.com/acme/project/issues/2",
        lastOpenedAt: 100,
      },
    ]);

    expect(countExactQueryWords("EPIC (#42) · Issues · acme / project · GitLab", "EPIC")).toBe(1);
    expect(countExactQueryWords("Dark mode", "dark mode sidebar")).toBe(2);

    const ranked = rankForgeIssueEntries(entries, "dark mode sidebar");
    const visual = flattenForgeNavigatorEntries(entries, "recent");
    expect(bestForgeNavigatorIndex(visual, ranked, "dark mode sidebar")).toBe(
      visual.findIndex((entry) => entry.ref.id === "2"),
    );
  });

  it("treats a renamed ISSUE: prefix title as a direct match", () => {
    const entries = buildForgeIssueEntries([
      {
        ...tab(1),
        title: "ISSUE: #42 - EPIC",
        url: "https://gitlab.com/acme/project/-/issues/42",
      },
      {
        ...tab(2),
        title: "ISSUE: #7 - Dark mode sidebar toggle",
        url: "https://gitlab.com/acme/project/-/issues/7",
      },
    ]);

    const ranked = rankForgeIssueEntries(entries, "EPIC");
    expect(ranked[0]?.direct).toBe(true);
    expect(ranked[0]?.entry.ref.id).toBe("42");
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
