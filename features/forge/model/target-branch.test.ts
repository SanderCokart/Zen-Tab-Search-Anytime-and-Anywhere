import { describe, expect, it } from "vitest";
import {
  forgeRequestKeyForUrl,
  MAX_REMEMBERED_TARGET_BRANCHES,
  mergeTabTargetBranches,
  normalizeBranchName,
  parseStoredTargetBranches,
  parseTargetBranchText,
  rememberTargetBranch,
} from "@/features/forge/model/target-branch";
import type { TabInfo } from "@/shared/types";

function tab(id: number, url: string): TabInfo {
  return { id, title: `Tab ${id}`, url, favIconUrl: "", windowId: 1 };
}

describe("forgeRequestKeyForUrl", () => {
  it("keys an MR or PR by host, project and number, whatever page of it is open", () => {
    expect(
      forgeRequestKeyForUrl("https://gitlab.com/acme/app/-/merge_requests/12/diffs?view=inline"),
    ).toBe("gitlab.com/acme/app/merge_request/12");
    expect(forgeRequestKeyForUrl("https://github.com/acme/app/pull/7/files#diff")).toBe(
      "github.com/acme/app/pull_request/7",
    );
  });

  it("gives issues and other pages no key", () => {
    expect(forgeRequestKeyForUrl("https://gitlab.com/acme/app/-/issues/3")).toBeUndefined();
    expect(forgeRequestKeyForUrl("https://example.com/")).toBeUndefined();
    expect(forgeRequestKeyForUrl(undefined)).toBeUndefined();
  });
});

describe("parseTargetBranchText", () => {
  it("reads GitLab's merge request header", () => {
    expect(
      parseTargetBranchText(
        "Jane Doe requested to merge feature/login into release/4.2 2 days ago",
      ),
    ).toBe("release/4.2");
  });

  it("reads GitHub's open and merged pull request headers", () => {
    expect(parseTargetBranchText("jane wants to merge 3 commits into main from feature")).toBe(
      "main",
    );
    expect(parseTargetBranchText("jane merged 1 commit into develop from fix")).toBe("develop");
  });

  it("drops the owner GitHub shows on a fork's base", () => {
    expect(parseTargetBranchText("jane wants to merge 2 commits into acme:main from jane:x")).toBe(
      "main",
    );
  });

  it("finds nothing on a page without a header", () => {
    expect(parseTargetBranchText("Just some text into main")).toBeUndefined();
  });
});

describe("normalizeBranchName", () => {
  it("trims whitespace and rejects names git would not allow", () => {
    expect(normalizeBranchName("\n  main  ")).toBe("main");
    expect(normalizeBranchName("two words")).toBeUndefined();
    expect(normalizeBranchName("")).toBeUndefined();
  });
});

describe("rememberTargetBranch", () => {
  it("returns nothing when the branch is already remembered", () => {
    const stored = { key: { branch: "main", savedAt: 1 } };
    expect(rememberTargetBranch(stored, "key", "main", 2)).toBeUndefined();
    expect(rememberTargetBranch(stored, "key", "develop", 2)).toEqual({
      key: { branch: "develop", savedAt: 2 },
    });
  });

  it("drops the oldest entries beyond the limit", () => {
    const stored = Object.fromEntries(
      Array.from({ length: MAX_REMEMBERED_TARGET_BRANCHES }, (_, index) => [
        `key-${index}`,
        { branch: "main", savedAt: index + 1 },
      ]),
    );
    const next = rememberTargetBranch(stored, "new", "main", 10_000)!;
    expect(Object.keys(next)).toHaveLength(MAX_REMEMBERED_TARGET_BRANCHES);
    expect(next["key-0"]).toBeUndefined();
    expect(next.new).toEqual({ branch: "main", savedAt: 10_000 });
  });
});

describe("parseStoredTargetBranches", () => {
  it("keeps only well-formed entries", () => {
    expect(
      parseStoredTargetBranches({
        good: { branch: "main", savedAt: 1 },
        bad: { branch: "", savedAt: 1 },
        worse: "main",
      }),
    ).toEqual({ good: { branch: "main", savedAt: 1 } });
    expect(parseStoredTargetBranches(undefined)).toEqual({});
  });
});

describe("mergeTabTargetBranches", () => {
  it("gives MR and PR tabs their remembered branch", () => {
    const tabs = [
      tab(1, "https://gitlab.com/acme/app/-/merge_requests/12"),
      tab(2, "https://gitlab.com/acme/app/-/merge_requests/13"),
      tab(3, "https://gitlab.com/acme/app/-/issues/12"),
    ];
    const merged = mergeTabTargetBranches(tabs, {
      "gitlab.com/acme/app/merge_request/12": { branch: "main", savedAt: 1 },
    });
    expect(merged[0]?.forgeTargetBranch).toBe("main");
    expect(merged[1]).toBe(tabs[1]);
    expect(merged[2]).toBe(tabs[2]);
  });
});
