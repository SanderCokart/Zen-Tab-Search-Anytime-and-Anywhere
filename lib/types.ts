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
}

export interface SpaceInfo {
  id: string;
  name: string;
  icon?: string;
  isActive: boolean;
  score?: number;
}

export type SearchItem = { kind: "tab"; data: TabInfo } | { kind: "space"; data: SpaceInfo };

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
  return (
    (Number.isInteger(tab.id) && tab.id! >= 0) ||
    (typeof tab.domId === "string" && tab.domId.length > 0)
  );
}
