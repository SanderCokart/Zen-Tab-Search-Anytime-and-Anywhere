import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";

/** Which kinds of entry the Issues & requests navigator lists. */
export type ForgeKindFilter = "all" | "issues" | "requests";

export const FORGE_KIND_FILTERS: readonly ForgeKindFilter[] = ["all", "issues", "requests"];

export interface ForgeKindCounts {
  all: number;
  issues: number;
  /** Merge requests and pull requests together. */
  requests: number;
}

function matchesFilter(entry: ForgeIssueEntry, filter: ForgeKindFilter): boolean {
  if (filter === "all") return true;
  return filter === "issues" ? entry.ref.kind === "issue" : entry.ref.kind !== "issue";
}

/** The entries of one kind; `all` returns the input untouched. */
export function filterForgeEntriesByKind(
  entries: ForgeIssueEntry[],
  filter: ForgeKindFilter,
): ForgeIssueEntry[] {
  return filter === "all" ? entries : entries.filter((entry) => matchesFilter(entry, filter));
}

export function countForgeEntriesByKind(entries: readonly ForgeIssueEntry[]): ForgeKindCounts {
  let issues = 0;
  for (const entry of entries) {
    if (entry.ref.kind === "issue") issues++;
  }
  return { all: entries.length, issues, requests: entries.length - issues };
}

export function isForgeRequest(entry: ForgeIssueEntry): boolean {
  return entry.ref.kind !== "issue";
}

/** Whether this tab should stay out of the overlay's tab list. */
export function hidesForgeEntryInOverlay(
  entry: ForgeIssueEntry,
  settings: { filterIssuesInOverlay: boolean; filterRequestsInOverlay: boolean },
): boolean {
  return isForgeRequest(entry) ? settings.filterRequestsInOverlay : settings.filterIssuesInOverlay;
}

/** "PRs" when every entry is a GitHub one, otherwise "MRs". */
export function forgeRequestsLabel(entries: readonly ForgeIssueEntry[]): "PRs" | "MRs" {
  return entries.length > 0 && entries.every((entry) => entry.ref.platform === "github")
    ? "PRs"
    : "MRs";
}
