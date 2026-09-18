import type { ForgeKind, ForgePlatform, ForgeRef } from "./forge-label";

export interface FolderInfo {
  id: string;
  name: string;
}

export interface TabInfo {
  id: number | null;
  domId?: string;
  title: string;
  customLabel?: string;
  url: string;
  favIconUrl: string;
  windowId: number;
  workspaceId?: string;
  workspaceName?: string;
  folderId?: string;
  folderName?: string;
  folderPath?: FolderInfo[];
  essential?: boolean;
  lastOpenedAt?: number;
  score?: number;
  active?: boolean;
}

export interface TabTimer {
  tabId: number;
  endAt: number;
  originalLabel: string;
  title: string;
}

export interface SpaceInfo {
  id: string;
  name: string;
  icon?: string;
  isActive: boolean;
  score?: number;
}

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
