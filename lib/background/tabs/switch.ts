import type { WorkspaceAdapter } from "../zen/adapter";

export function createTabSwitcher(workspace: WorkspaceAdapter): {
  switchToTab(tabId?: number, domId?: string, anchorTabId?: number): Promise<void>;
  switchToSpace(spaceId: string, anchorTabId?: number): Promise<void>;
} {
  return {
    switchToTab: (tabId, domId, anchorTabId) => workspace.activateTab(tabId, domId, anchorTabId),
    switchToSpace: (spaceId, anchorTabId) => workspace.switchSpace(spaceId, anchorTabId),
  };
}
