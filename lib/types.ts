import type { ForgeKind, ForgePlatform, ForgeRef } from "@/lib/forge-label";
import type { SpaceInfo, TabInfo } from "@/lib/messaging/protocol";

/**
 * The wire schemas in `messaging/protocol.ts` are the single source of truth for
 * these shapes; they are re-exported here so feature code keeps importing domain
 * types from one place.
 */
export type { FolderInfo, SpaceInfo, TabInfo, TabTimer } from "@/lib/messaging/protocol";

export interface ForgeIssueEntry {
  ref: ForgeRef;
  tab: TabInfo;
  title: string;
  projectLabel: string;
}

export type SearchItem = { kind: "tab"; data: TabInfo } | { kind: "space"; data: SpaceInfo };

export function formatForgeKind(kind: ForgeKind): string {
  if (kind === "merge_request") return "Merge request";
  if (kind === "pull_request") return "Pull request";
  return "Issue";
}

export function formatForgePlatform(platform: ForgePlatform): string {
  return platform === "github" ? "GitHub" : "GitLab";
}

export function isUsableTabId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function formatTabDisplayTitle(tab: TabInfo): string {
  const title = tab.title || "Untitled";
  const customLabel = tab.customLabel?.trim();
  if (customLabel) {
    return `${customLabel} | ${title}`;
  }
  return title;
}

export function formatSpaceDisplayTitle(space: SpaceInfo): string {
  return space.name;
}

export function isActivatableTab(tab: TabInfo): boolean {
  return tabBrowserId(tab) !== undefined || (typeof tab.domId === "string" && tab.domId.length > 0);
}

export function isEssentialTab(tab: TabInfo): boolean {
  return tab.essential === true;
}

export function tabBrowserId(tab: TabInfo): number | undefined {
  return isUsableTabId(tab.id) ? tab.id : undefined;
}

export function canRenameTab(tab: TabInfo): boolean {
  if (isEssentialTab(tab)) {
    return typeof tab.domId === "string" && tab.domId.length > 0;
  }
  return tabBrowserId(tab) !== undefined;
}
