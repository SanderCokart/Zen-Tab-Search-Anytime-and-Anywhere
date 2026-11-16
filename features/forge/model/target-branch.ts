import * as v from "valibot";
import { parseForgeUrl, type ForgeRef } from "@/features/forge/model/forge-label";
import type { TabInfo } from "@/shared/types";

/**
 * MR/PR target branches the content script read off their pages. The URL does
 * not carry the branch, so it is remembered here per request, across restarts.
 */
export const FORGE_TARGET_BRANCHES_STORAGE_KEY = "forgeTargetBranches";

/** The oldest remembered requests are dropped beyond this many. */
export const MAX_REMEMBERED_TARGET_BRANCHES = 500;

const storedTargetBranchSchema = v.object({
  branch: v.pipe(v.string(), v.minLength(1)),
  savedAt: v.number(),
});

export type StoredTargetBranch = v.InferOutput<typeof storedTargetBranchSchema>;
export type StoredTargetBranches = Record<string, StoredTargetBranch>;

/** Identifies an MR/PR whatever its URL's tab, query or fragment; issues have none. */
export function forgeRequestKey(ref: ForgeRef): string | undefined {
  return ref.kind === "issue" ? undefined : `${ref.host}/${ref.projectPath}/${ref.kind}/${ref.id}`;
}

export function forgeRequestKeyForUrl(url: string | undefined): string | undefined {
  const ref = url ? parseForgeUrl(url) : null;
  return ref ? forgeRequestKey(ref) : undefined;
}

/**
 * Cleans a branch name as a page shows it: GitHub writes a fork's base as
 * `owner:branch`, and git branch names cannot contain a colon.
 */
export function normalizeBranchName(raw: string): string | undefined {
  const branch = (raw.split(":").pop() ?? "").trim().replace(/^["'`]+|["'`.,;)]+$/g, "");
  return branch && branch.length <= 255 && !/[\s~^?*[\\]/.test(branch) ? branch : undefined;
}

const TARGET_BRANCH_PATTERNS = [
  // GitLab: "Jane requested to merge feature into main"
  /requested to merge\s+\S+\s+into\s+(\S+)/i,
  // GitHub: "jane wants to merge 3 commits into main from feature", or "merged" once merged
  /\b(?:wants to merge|merged)\s+\d+\s+commits?\s+into\s+(\S+)\s+from\s+\S+/i,
];

/** The target branch named in an MR/PR page's header text, if it names one. */
export function parseTargetBranchText(text: string): string | undefined {
  for (const pattern of TARGET_BRANCH_PATTERNS) {
    const raw = text.match(pattern)?.[1];
    const branch = raw ? normalizeBranchName(raw) : undefined;
    if (branch) {
      return branch;
    }
  }
  return undefined;
}

export function parseStoredTargetBranches(value: unknown): StoredTargetBranches {
  if (!value || typeof value !== "object") {
    return {};
  }

  const stored: StoredTargetBranches = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const parsed = v.safeParse(storedTargetBranchSchema, entry);
    if (parsed.success) {
      stored[key] = parsed.output;
    }
  }
  return stored;
}

/**
 * The record with `key` set to `branch`, or undefined when it already was, so
 * reloading an MR page does not write storage (and refresh every UI) each time.
 */
export function rememberTargetBranch(
  stored: StoredTargetBranches,
  key: string,
  branch: string,
  now: number,
): StoredTargetBranches | undefined {
  if (stored[key]?.branch === branch) {
    return undefined;
  }

  const next = { ...stored, [key]: { branch, savedAt: now } };
  const keys = Object.keys(next);
  if (keys.length <= MAX_REMEMBERED_TARGET_BRANCHES) {
    return next;
  }
  const kept = keys
    .sort((first, second) => next[second]!.savedAt - next[first]!.savedAt)
    .slice(0, MAX_REMEMBERED_TARGET_BRANCHES);
  return Object.fromEntries(kept.map((keptKey) => [keptKey, next[keptKey]!]));
}

/** Gives each MR/PR tab the target branch remembered for it. */
export function mergeTabTargetBranches(tabs: TabInfo[], stored: StoredTargetBranches): TabInfo[] {
  return tabs.map((tab) => {
    const key = forgeRequestKeyForUrl(tab.url);
    const branch = key === undefined ? undefined : stored[key]?.branch;
    return branch ? { ...tab, forgeTargetBranch: branch } : tab;
  });
}
