import { describe, expect, it } from "vitest";
import {
  countForgeEntriesByKind,
  filterForgeEntriesByKind,
  forgeRequestsLabel,
} from "@/features/forge/model/forge-filter";
import type { ForgeIssueEntry, ForgeKind, ForgePlatform } from "@/features/forge/model/forge-label";

function entry(kind: ForgeKind, id: string, platform: ForgePlatform = "gitlab"): ForgeIssueEntry {
  const url = `https://${platform}.example/a/b/${id}`;
  return {
    ref: { platform, kind, id, host: `${platform}.example`, projectPath: "a/b", url },
    tab: { id: Number(id), title: id, url, favIconUrl: "", windowId: 1 },
    title: id,
    projectLabel: "a/b",
  };
}

const entries = [
  entry("issue", "1"),
  entry("merge_request", "2"),
  entry("pull_request", "3", "github"),
  entry("issue", "4", "github"),
  entry("issue", "5"),
];

describe("filterForgeEntriesByKind", () => {
  it("returns everything for all", () => {
    expect(filterForgeEntriesByKind(entries, "all")).toBe(entries);
  });

  it("keeps only issues", () => {
    expect(filterForgeEntriesByKind(entries, "issues").map((item) => item.ref.id)).toEqual([
      "1",
      "4",
      "5",
    ]);
  });

  it("keeps merge requests and pull requests together", () => {
    expect(filterForgeEntriesByKind(entries, "requests").map((item) => item.ref.id)).toEqual([
      "2",
      "3",
    ]);
  });
});

describe("countForgeEntriesByKind", () => {
  it("counts each kind and the total", () => {
    expect(countForgeEntriesByKind(entries)).toEqual({ all: 5, issues: 3, requests: 2 });
    expect(countForgeEntriesByKind([])).toEqual({ all: 0, issues: 0, requests: 0 });
  });
});

describe("forgeRequestsLabel", () => {
  it("says PRs only when every entry is on GitHub", () => {
    expect(forgeRequestsLabel([entry("pull_request", "3", "github")])).toBe("PRs");
    expect(forgeRequestsLabel(entries)).toBe("MRs");
    expect(forgeRequestsLabel([entry("merge_request", "2")])).toBe("MRs");
    expect(forgeRequestsLabel([])).toBe("MRs");
  });
});
