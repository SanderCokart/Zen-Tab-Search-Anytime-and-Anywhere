import { describe, expect, it } from "vitest";
import {
  buildForgeLabel,
  detectForgePlatform,
  extractRelatedIssueId,
  parseForgeUrl,
} from "../lib/forge-label";

describe("detectForgePlatform", () => {
  it("detects GitLab from the hostname", () => {
    expect(
      detectForgePlatform("https://gitlab.com/SanderCokart/zen-tab-search/-/issues/999991"),
    ).toBe("gitlab");
  });

  it("detects GitHub from the hostname", () => {
    expect(detectForgePlatform("https://github.com/SanderCokart/zen-tab-search/pull/999994")).toBe(
      "github",
    );
  });
});

describe("parseForgeUrl", () => {
  it("parses GitLab issues", () => {
    expect(parseForgeUrl("https://gitlab.com/SanderCokart/zen-tab-search/-/issues/999991")).toEqual(
      {
        platform: "gitlab",
        kind: "issue",
        id: "999991",
      },
    );
  });

  it("parses GitLab merge requests", () => {
    expect(
      parseForgeUrl("https://gitlab.com/SanderCokart/zen-tab-search/-/merge_requests/999992/diffs"),
    ).toEqual({
      platform: "gitlab",
      kind: "merge_request",
      id: "999992",
    });
  });

  it("parses GitHub issues and pull requests", () => {
    expect(parseForgeUrl("https://github.com/SanderCokart/zen-tab-search/issues/999993")).toEqual({
      platform: "github",
      kind: "issue",
      id: "999993",
    });
    expect(parseForgeUrl("https://github.com/SanderCokart/zen-tab-search/pull/999994")).toEqual({
      platform: "github",
      kind: "pull_request",
      id: "999994",
    });
  });
});

describe("extractRelatedIssueId", () => {
  it("prefers Closes over later mentions", () => {
    expect(extractRelatedIssueId("Mentions #9\nCloses #999991", "999992")).toBe("999991");
  });

  it("falls back to issue URLs and hash mentions", () => {
    expect(
      extractRelatedIssueId(
        "See https://gitlab.com/SanderCokart/zen-tab-search/-/issues/999991",
        "999992",
      ),
    ).toBe("999991");
  });
});

describe("buildForgeLabel", () => {
  it("formats GitLab issues", () => {
    expect(
      buildForgeLabel(
        "https://gitlab.com/SanderCokart/zen-tab-search/-/issues/999991",
        "Example issue (#999991) · Issue · SanderCokart/zen-tab-search",
        { title: "Example issue" },
      ),
    ).toBe("ISSUE: #999991 - Example issue");
  });

  it("formats GitLab merge requests with a related issue", () => {
    expect(
      buildForgeLabel(
        "https://gitlab.com/SanderCokart/zen-tab-search/-/merge_requests/999992",
        "Example change (!999992) · Merge requests · SanderCokart/zen-tab-search",
        { title: "Example change", bodyText: "Closes #999991" },
      ),
    ).toBe("MR: #999991 - !999992 - Example change");
  });

  it("omits the issue segment when an MR has no related issue", () => {
    expect(
      buildForgeLabel(
        "https://gitlab.com/SanderCokart/zen-tab-search/-/merge_requests/999992",
        "Example change",
      ),
    ).toBe("MR: !999992 - Example change");
  });

  it("formats GitHub pull requests", () => {
    expect(
      buildForgeLabel(
        "https://github.com/SanderCokart/zen-tab-search/pull/999994",
        "Example pull request",
        {
          bodyText: "Fixes #999993",
        },
      ),
    ).toBe("PR: #999993 - !999994 - Example pull request");
  });
});
