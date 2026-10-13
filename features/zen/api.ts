import type { SpaceInfo, TabInfo } from "@/shared/types";
import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";

export interface ZenDebugInfo {
  timestamp: string;
  anchorTabId: number;
  servicesSource: string;
  servicesImport: string;
  windowSource: string;
  tabManagerWindowCount: number;
  windowFound: boolean;
  hasGZenWorkspaces: boolean;
  hasGBrowser: boolean;
  hasPromiseInitialized: boolean;
  workspaceEnabled: boolean | null;
  workspaceCount: number;
  activeWorkspace: string;
  storedTabCount: number;
  domTabCount: number;
  errors: string[];
}

export interface ZenTabsApi {
  getDebugInfo(anchorTabId?: number): Promise<ZenDebugInfo>;
  getCustomLabels(tabIds?: number[]): Promise<Record<number, string>>;
  getSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
  getAllTabs(anchorTabId?: number): Promise<TabInfo[] | null>;
  getSelectedTabs(anchorTabId?: number): Promise<TabInfo[]>;
  switchSpace(spaceId: string, anchorTabId?: number): Promise<boolean>;
  activateTab(tabId: number, anchorTabId?: number): Promise<boolean>;
  activateTabByDomId(domId: string, anchorTabId?: number): Promise<boolean>;
  changeLabel(anchorTabId?: number): Promise<boolean>;
  setLabel(label: string, anchorTabId?: number, silent?: boolean): Promise<boolean>;
  consumeExternalTab?(tabId: number): Promise<string>;
  listFolders?(anchorTabId?: number): Promise<ZenFolderInfo[]>;
  createFolder?(
    name: string,
    spaceId: string,
    tabIds: number[],
    anchorTabId?: number,
  ): Promise<string>;
  renameFolder?(folderId: string, name: string): Promise<boolean>;
  moveTabsToFolder?(tabIds: number[], folderId: string): Promise<number>;
  removeTabsFromFolder?(tabIds: number[]): Promise<number>;
  moveTabsToSpace?(tabIds: number[], spaceId: string): Promise<number>;
  moveTab?(tabId: number, beforeTabId?: number, afterTabId?: number): Promise<boolean>;
}

export function getZenTabsApi(): ZenTabsApi | undefined {
  return (browser as typeof browser & { zenTabs?: ZenTabsApi }).zenTabs;
}
