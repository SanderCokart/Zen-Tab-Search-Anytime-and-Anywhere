import { describe, expect, it } from "vitest";
import {
  forgeRowParts,
  buildForgeLabel,
  detectForgePlatform,
  extractRelatedIssueId,
  forgeProjectHomeUrl,
  forgeTitleIncludesRefId,
  parseForgeUrl,
  relatedIssueIdFromLabel,
  tabMatchesForgeProjectHome,
} from "@/features/forge/model/forge-label";

describe("detectForgePlatform", () => {
  it("detects GitLab from the hostname", () => {
    expect(detectForgePlatform("https://gitlab.com/SanderCokart/zen-deck/-/issues/999991")).toBe(
      "gitlab",
    );
  });

  it("detects GitHub from the hostname", () => {
    expect(detectForgePlatform("https://github.com/SanderCokart/zen-deck/pull/999994")).toBe(
      "github",
    );
  });
});

describe("parseForgeUrl", () => {
  it("parses GitLab issues", () => {
    expect(parseForgeUrl("https://gitlab.com/SanderCokart/zen-deck/-/issues/999991")).toEqual({
      platform: "gitlab",
      kind: "issue",
      id: "999991",
      host: "gitlab.com",
      projectPath: "SanderCokart/zen-deck",
      url: "https://gitlab.com/SanderCokart/zen-deck/-/issues/999991",
    });
  });

  it("parses GitLab merge requests", () => {
    expect(
      parseForgeUrl("https://gitlab.com/SanderCokart/zen-deck/-/merge_requests/999992/diffs"),
    ).toEqual({
      platform: "gitlab",
      kind: "merge_request",
      id: "999992",
      host: "gitlab.com",
      projectPath: "SanderCokart/zen-deck",
      url: "https://gitlab.com/SanderCokart/zen-deck/-/merge_requests/999992/diffs",
    });
  });

  it("parses GitHub issues and pull requests", () => {
    expect(parseForgeUrl("https://github.com/SanderCokart/zen-deck/issues/999993")).toEqual({
      platform: "github",
      kind: "issue",
      id: "999993",
      host: "github.com",
      projectPath: "SanderCokart/zen-deck",
      url: "https://github.com/SanderCokart/zen-deck/issues/999993",
    });
    expect(parseForgeUrl("https://github.com/SanderCokart/zen-deck/pull/999994")).toEqual({
      platform: "github",
      kind: "pull_request",
      id: "999994",
      host: "github.com",
      projectPath: "SanderCokart/zen-deck",
      url: "https://github.com/SanderCokart/zen-deck/pull/999994",
    });
  });
});

describe("forgeProjectHomeUrl", () => {
  it("builds the repository homepage from an issue or pull request", () => {
    expect(
      forgeProjectHomeUrl(parseForgeUrl("https://github.com/SanderCokart/Zen-Deck/pull/1")!),
    ).toBe("https://github.com/SanderCokart/Zen-Deck");
    expect(
      forgeProjectHomeUrl(parseForgeUrl("https://gitlab.com/gitlab-org/quality/app/-/issues/12")!),
    ).toBe("https://gitlab.com/gitlab-org/quality/app");
  });
});

describe("tabMatchesForgeProjectHome", () => {
  it("matches the homepage even with a trailing slash or query", () => {
    const home = "https://github.com/SanderCokart/Zen-Deck";
    expect(tabMatchesForgeProjectHome("https://github.com/SanderCokart/Zen-Deck", home)).toBe(true);
    expect(tabMatchesForgeProjectHome("https://github.com/SanderCokart/Zen-Deck/", home)).toBe(
      true,
    );
    expect(
      tabMatchesForgeProjectHome(
        "https://github.com/SanderCokart/Zen-Deck?tab=readme-ov-file",
        home,
      ),
    ).toBe(true);
    expect(
      tabMatchesForgeProjectHome("https://github.com/SanderCokart/Zen-Deck/pull/1", home),
    ).toBe(false);
  });
});

describe("forgeTitleIncludesRefId", () => {
  it("detects issue and MR ids already present in the tab title", () => {
    expect(forgeTitleIncludesRefId("MR: !19824 - Two-column checkout", "19824")).toBe(true);
    expect(forgeTitleIncludesRefId("ISSUE: #383 SalesPOS homepage", "383")).toBe(true);
    expect(forgeTitleIncludesRefId("Fix search", "42")).toBe(false);
    expect(forgeTitleIncludesRefId("Issue 421", "42")).toBe(false);
  });
});

describe("relatedIssueIdFromLabel", () => {
  it("reads the issue id from an MR or PR label prefix", () => {
    expect(relatedIssueIdFromLabel("MR: #4 - !8 - Login", "8")).toBe("4");
    expect(relatedIssueIdFromLabel("PR: #4 - !8 - Login", "8")).toBe("4");
    expect(relatedIssueIdFromLabel("MR: !8 - Login", "8")).toBeUndefined();
    expect(relatedIssueIdFromLabel("ISSUE: #4 - Login", "4")).toBeUndefined();
  });
});

describe("extractRelatedIssueId", () => {
  it("prefers Closes over later mentions", () => {
    expect(extractRelatedIssueId("Mentions #9\nCloses #999991", "999992")).toBe("999991");
  });

  it("falls back to issue URLs and hash mentions", () => {
    expect(
      extractRelatedIssueId(
        "See https://gitlab.com/SanderCokart/zen-deck/-/issues/999991",
        "999992",
      ),
    ).toBe("999991");
  });
});

describe("buildForgeLabel", () => {
  it("formats GitLab issues", () => {
    expect(
      buildForgeLabel(
        "https://gitlab.com/SanderCokart/zen-deck/-/issues/999991",
        "Example issue (#999991) · Issue · SanderCokart/zen-deck",
        { title: "Example issue" },
      ),
    ).toBe("ISSUE: #999991 - Example issue");
  });

  it("formats GitLab merge requests with a related issue", () => {
    expect(
      buildForgeLabel(
        "https://gitlab.com/SanderCokart/zen-deck/-/merge_requests/999992",
        "Example change (!999992) · Merge requests · SanderCokart/zen-deck",
        { title: "Example change", bodyText: "Closes #999991" },
      ),
    ).toBe("MR: #999991 - !999992 - Example change");
  });

  it("omits the issue segment when an MR has no related issue", () => {
    expect(
      buildForgeLabel(
        "https://gitlab.com/SanderCokart/zen-deck/-/merge_requests/999992",
        "Example change",
      ),
    ).toBe("MR: !999992 - Example change");
  });

  it("does not stack a prefix that is already on the title", () => {
    expect(
      buildForgeLabel(
        "https://gitlab.com/acme/app/-/merge_requests/19962",
        "MR: !19962 - MR: !19962 - Example change",
      ),
    ).toBe("MR: !19962 - Example change");
  });

  it("formats GitHub pull requests", () => {
    expect(
      buildForgeLabel(
        "https://github.com/SanderCokart/zen-deck/pull/999994",
        "Example pull request",
        {
          bodyText: "Fixes #999993",
        },
      ),
    ).toBe("PR: #999993 - !999994 - Example pull request");
  });
});

describe("forgeRowParts", () => {
  const issue = parseForgeUrl("https://gitlab.com/acme/app/-/issues/12")!;
  const mr = parseForgeUrl("https://gitlab.com/acme/app/-/merge_requests/88")!;
  const pr = parseForgeUrl("https://github.com/acme/app/pull/5")!;

  it("drops the issue prefix and keeps the ref and tag", () => {
    expect(forgeRowParts(issue, "ISSUE: #12 - Fix search")).toEqual({
      tag: "ISSUE",
      ref: "#12",
      title: "Fix search",
    });
  });

  it("drops the MR prefix, including a related issue", () => {
    expect(forgeRowParts(mr, "MR: #7 - !88 - Add filter").title).toBe("Add filter");
    expect(forgeRowParts(mr, "MR: !88 - Add filter")).toMatchObject({ tag: "MR", ref: "!88" });
  });

  it("tags a GitHub pull request PR with a # ref", () => {
    expect(forgeRowParts(pr, "PR: !5 - Bump deps")).toEqual({
      tag: "PR",
      ref: "#5",
      title: "Bump deps",
    });
  });

  it("recognises an epic and removes its marker", () => {
    expect(forgeRowParts(issue, "ISSUE: #12 - EPIC — Two-column checkout")).toEqual({
      tag: "EPIC",
      ref: "#12",
      title: "Two-column checkout",
    });
  });

  it("leaves a name without a prefix untouched", () => {
    expect(forgeRowParts(issue, "My own name").title).toBe("My own name");
  });
});
