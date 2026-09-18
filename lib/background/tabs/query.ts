import type { SpaceInfo, TabInfo } from "@/lib/types";
import type { WorkspaceAdapter } from "@/lib/background/zen/adapter";

export function createTabQuery(workspace: WorkspaceAdapter): {
  queryTabs(anchorTabId?: number): Promise<TabInfo[]>;
  getTabInfo(tabId: number): Promise<TabInfo>;
  getSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
} {
  return {
    queryTabs: (anchorTabId) => workspace.listTabs(anchorTabId),
    getTabInfo: (tabId) => workspace.getTab(tabId),
    getSpaces: (anchorTabId) => workspace.listSpaces(anchorTabId),
  };
}
