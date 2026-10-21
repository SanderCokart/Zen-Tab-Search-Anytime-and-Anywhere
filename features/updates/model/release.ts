import * as v from "valibot";
import { parseVersion } from "@/features/updates/model/version";
import type { LatestRelease } from "@/shared/types";

/** Where releases are published; `scripts/release.mjs` creates them with `gh release create`. */
export const RELEASES_REPO = "SanderCokart/Zen-Tab-Search-Anytime-and-Anywhere";

/** GitHub's newest non-prerelease, non-draft release, so canaries never show up as updates. */
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;

/**
 * Release assets the in-place install accepts. Anything else would mean the
 * GitHub response is not what the release script produced.
 */
export const RELEASE_DOWNLOAD_PREFIX = `https://github.com/${RELEASES_REPO}/releases/download/`;

/** The part of GitHub's release response the update check reads. */
const githubReleaseSchema = v.object({
  tag_name: v.string(),
  html_url: v.string(),
  assets: v.array(
    v.object({
      name: v.string(),
      browser_download_url: v.string(),
    }),
  ),
});

/**
 * The version, release page and Firefox zip of a GitHub release response.
 * Undefined when the tag is not a version or the release has no Firefox zip.
 */
export function parseLatestRelease(response: unknown): LatestRelease | undefined {
  const parsed = v.safeParse(githubReleaseSchema, response);
  if (!parsed.success || !parseVersion(parsed.output.tag_name)) {
    return undefined;
  }
  const release = parsed.output;
  const zip = release.assets.find(
    (asset) =>
      asset.name.endsWith("-firefox.zip") &&
      asset.browser_download_url.startsWith(RELEASE_DOWNLOAD_PREFIX),
  );
  if (!zip) {
    return undefined;
  }
  return {
    version: release.tag_name.replace(/^v/, ""),
    zipUrl: zip.browser_download_url,
    releaseUrl: release.html_url,
  };
}
