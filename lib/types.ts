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

export type SearchItem = { kind: "tab"; data: TabInfo } | { kind: "space"; data: SpaceInfo };

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

export function tabBrowserId(tab: TabInfo): number | undefined {
  return isUsableTabId(tab.id) ? tab.id : undefined;
}
