import { describe, expect, it } from "vitest";
import { parseLatestRelease, RELEASE_DOWNLOAD_PREFIX } from "@/features/updates/model/release";

const zipUrl = `${RELEASE_DOWNLOAD_PREFIX}v4.0.2/zen-tab-search-v4.0.2-firefox.zip`;

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: "v4.0.2",
    html_url: "https://github.com/x/y/releases/tag/v4.0.2",
    assets: [
      {
        name: "zen-tab-search-mcp.mjs",
        browser_download_url: `${RELEASE_DOWNLOAD_PREFIX}v4.0.2/mcp`,
      },
      { name: "zen-tab-search-v4.0.2-firefox.zip", browser_download_url: zipUrl },
    ],
    ...overrides,
  };
}

describe("parseLatestRelease", () => {
  it("picks the version, release page and Firefox zip", () => {
    expect(parseLatestRelease(release())).toEqual({
      version: "4.0.2",
      zipUrl,
      releaseUrl: "https://github.com/x/y/releases/tag/v4.0.2",
    });
  });

  it("ignores a release without a version tag or a Firefox zip", () => {
    expect(parseLatestRelease(release({ tag_name: "screenshot-generator" }))).toBeUndefined();
    expect(parseLatestRelease(release({ assets: [] }))).toBeUndefined();
    expect(parseLatestRelease({ message: "API rate limit exceeded" })).toBeUndefined();
  });

  it("refuses a zip hosted anywhere but this repository's releases", () => {
    const assets = [
      {
        name: "zen-tab-search-v4.0.2-firefox.zip",
        browser_download_url: "https://evil.test/a.zip",
      },
    ];
    expect(parseLatestRelease(release({ assets }))).toBeUndefined();
  });
});
