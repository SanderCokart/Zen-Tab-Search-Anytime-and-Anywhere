import { describe, expect, it } from "vitest";
import {
  forgeBranchKey,
  forgeGroupKeys,
  forgeIssuesKey,
  forgeProjectKey,
  forgeTreeKeys,
  groupToCollapse,
  groupToExpand,
  MAX_COLLAPSED_GROUPS,
  nearestCollapsedGroup,
  openedForgeCollapsed,
  parseCollapsedGroups,
  toggleCollapsedKey,
} from "@/features/forge/model/forge-collapse";
import type { ForgeIssueEntry, ForgeKind, ForgePlatform } from "@/features/forge/model/forge-label";
import {
  flattenForgeNavigatorEntries,
  groupForgeIssueEntries,
} from "@/features/search/model/ranking";

function entry(
  kind: ForgeKind,
  id: string,
  project = "a/b",
  targetBranch?: string,
  platform: ForgePlatform = "gitlab",
): ForgeIssueEntry {
  const url = `https://${platform}.example/${project}/${id}`;
  return {
    ref: { platform, kind, id, host: `${platform}.example`, projectPath: project, url },
    tab: {
      id: Number(id),
      title: id,
      url,
      favIconUrl: "",
      windowId: 1,
      lastOpenedAt: 1000 - Number(id),
    },
    title: id,
    projectLabel: project,
    ...(targetBranch ? { targetBranch } : {}),
  };
}

const issue1 = entry("issue", "1");
const issue2 = entry("issue", "2");
const mrMain = entry("merge_request", "3", "a/b", "main");
const mrDev = entry("merge_request", "4", "a/b", "develop");
const mrUnknown = entry("merge_request", "5");
const other = entry("issue", "6", "c/d");
const all = [issue1, issue2, mrMain, mrDev, mrUnknown, other];

const ids = (entries: ForgeIssueEntry[]) => entries.map((item) => item.ref.id);

describe("group keys", () => {
  it("names the project, the Issues folder and each branch", () => {
    expect(forgeProjectKey("gitlab", "a/b")).toBe("project:gitlab:a/b");
    expect(forgeIssuesKey("gitlab", "a/b")).toBe("issues:gitlab:a/b");
    expect(forgeBranchKey("gitlab", "a/b", "main")).toBe("branch:gitlab:a/b:main");
    expect(forgeBranchKey("gitlab", "a/b", undefined)).toBe("branch:gitlab:a/b:?");
  });

  it("lists each project, its Issues folder and its branches", () => {
    expect(forgeTreeKeys(groupForgeIssueEntries(all, "recent"))).toEqual([
      forgeProjectKey("gitlab", "a/b"),
      forgeIssuesKey("gitlab", "a/b"),
      forgeBranchKey("gitlab", "a/b", "main"),
      forgeBranchKey("gitlab", "a/b", "develop"),
      forgeBranchKey("gitlab", "a/b", undefined),
      forgeProjectKey("gitlab", "c/d"),
      forgeIssuesKey("gitlab", "c/d"),
    ]);
  });

  it("finds the project and folder an entry sits under", () => {
    expect(forgeGroupKeys(issue1)).toEqual({
      project: "project:gitlab:a/b",
      folder: "issues:gitlab:a/b",
    });
    expect(forgeGroupKeys(mrMain).folder).toBe("branch:gitlab:a/b:main");
    expect(forgeGroupKeys(mrUnknown).folder).toBe("branch:gitlab:a/b:?");
  });
});

describe("flattenForgeNavigatorEntries with collapsed groups", () => {
  it("lists everything when nothing is collapsed", () => {
    const open = flattenForgeNavigatorEntries(all, "recent");
    expect(ids(open).sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(flattenForgeNavigatorEntries(all, "recent", new Set())).toEqual(open);
  });

  it("skips a collapsed project", () => {
    const flat = flattenForgeNavigatorEntries(all, "recent", new Set(["project:gitlab:a/b"]));
    expect(ids(flat)).toEqual(["6"]);
  });

  it("skips a collapsed Issues folder", () => {
    const flat = flattenForgeNavigatorEntries(all, "recent", new Set(["issues:gitlab:a/b"]));
    expect(ids(flat)).not.toContain("1");
    expect(ids(flat)).not.toContain("2");
    expect(ids(flat)).toEqual(expect.arrayContaining(["3", "4", "5", "6"]));
  });

  it("skips one branch folder, including the unknown-target one", () => {
    const flat = flattenForgeNavigatorEntries(
      all,
      "recent",
      new Set(["branch:gitlab:a/b:main", "branch:gitlab:a/b:?"]),
    );
    expect(ids(flat).sort()).toEqual(["1", "2", "4", "6"]);
  });
});

describe("collapsing from the keyboard", () => {
  it("collapses the folder first, then the project", () => {
    expect(groupToCollapse(mrMain, new Set())).toBe("branch:gitlab:a/b:main");
    expect(groupToCollapse(mrMain, new Set(["branch:gitlab:a/b:main"]))).toBe("project:gitlab:a/b");
    expect(
      groupToCollapse(mrMain, new Set(["branch:gitlab:a/b:main", "project:gitlab:a/b"])),
    ).toBeUndefined();
  });

  it("expands the outermost collapsed group first", () => {
    expect(groupToExpand(mrMain, new Set())).toBeUndefined();
    expect(groupToExpand(mrMain, new Set(["branch:gitlab:a/b:main", "project:gitlab:a/b"]))).toBe(
      "project:gitlab:a/b",
    );
    expect(groupToExpand(mrMain, new Set(["branch:gitlab:a/b:main"]))).toBe(
      "branch:gitlab:a/b:main",
    );
  });

  it("finds the collapsed group nearest the selection, preferring the one below", () => {
    const providers = groupForgeIssueEntries(all, "recent");
    const collapsed = new Set(["branch:gitlab:a/b:develop", "project:gitlab:c/d"]);
    const visible = flattenForgeNavigatorEntries(all, "recent", collapsed);
    expect(ids(visible).length).toBe(4);
    // Selecting the last visible request of a/b: the collapsed project c/d follows it.
    expect(nearestCollapsedGroup(providers, collapsed, visible.length - 1)).toBe(
      "project:gitlab:c/d",
    );
    // Selecting the first entry: develop sits after the issues and main, c/d after that.
    expect(nearestCollapsedGroup(providers, collapsed, 0)).toBe("branch:gitlab:a/b:develop");
    expect(nearestCollapsedGroup(providers, new Set(), 0)).toBeUndefined();
  });

  it("ignores a collapsed folder that sits inside a collapsed project", () => {
    const providers = groupForgeIssueEntries(all, "recent");
    const collapsed = new Set(["project:gitlab:a/b", "issues:gitlab:a/b"]);
    expect(nearestCollapsedGroup(providers, collapsed, 0)).toBe("project:gitlab:a/b");
  });
});

describe("collapsed group storage", () => {
  it("toggles a key in and out", () => {
    expect(toggleCollapsedKey([], "a")).toEqual(["a"]);
    expect(toggleCollapsedKey(["a", "b"], "a")).toEqual(["b"]);
  });

  it("drops the oldest keys past the cap", () => {
    const many = Array.from({ length: MAX_COLLAPSED_GROUPS }, (_, index) => `k${index}`);
    const next = toggleCollapsedKey(many, "new");
    expect(next).toHaveLength(MAX_COLLAPSED_GROUPS);
    expect(next[0]).toBe("k1");
    expect(next.at(-1)).toBe("new");
  });

  it("reads anything unreadable as nothing collapsed", () => {
    expect(parseCollapsedGroups(["a", "b"])).toEqual(["a", "b"]);
    for (const stored of [undefined, null, "x", 3, [1, 2], { a: 1 }]) {
      expect(parseCollapsedGroups(stored)).toEqual([]);
    }
    expect(parseCollapsedGroups(Array.from({ length: 300 }, (_, i) => `k${i}`))).toHaveLength(
      MAX_COLLAPSED_GROUPS,
    );
  });
});

describe("openedForgeCollapsed", () => {
  const collapsed = new Set(["project:gitlab:a/b", "issues:gitlab:a/b", "branch:gitlab:a/b:main"]);

  it("leaves stored collapse alone when no prefix kind is in play", () => {
    expect(openedForgeCollapsed(collapsed, undefined)).toBe(collapsed);
  });

  it("opens projects and Issues folders for a # query", () => {
    expect([...openedForgeCollapsed(collapsed, "issues")]).toEqual(["branch:gitlab:a/b:main"]);
  });

  it("opens projects and request folders for a ! query", () => {
    expect([...openedForgeCollapsed(collapsed, "requests")]).toEqual(["issues:gitlab:a/b"]);
  });
});
