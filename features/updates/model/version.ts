/** One dot-separated part of a version, and whether it differs from the installed one. */
export interface VersionSegment {
  text: string;
  changed: boolean;
}

/** `4.0.2` or `v4.0.2` as `[4, 0, 2]`; undefined for anything that is not plain semver. */
export function parseVersion(version: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when `latest` is a higher version than `current`. Unparseable versions never are. */
export function isNewerVersion(latest: string, current: string): boolean {
  const next = parseVersion(latest);
  const installed = parseVersion(current);
  if (!next || !installed) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    const difference = next[index]! - installed[index]!;
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return false;
}

/**
 * `latest` split into its parts, each marked when it differs from the same part
 * of `current`, so 4.0.2 against 4.0.0 lights up only the 2.
 */
export function versionSegments(latest: string, current: string): VersionSegment[] {
  const installed = current.replace(/^v/, "").split(".");
  return latest
    .replace(/^v/, "")
    .split(".")
    .map((text, index) => ({ text, changed: text !== installed[index] }));
}
