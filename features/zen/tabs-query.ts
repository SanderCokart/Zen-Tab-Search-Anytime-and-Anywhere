import type { SpaceInfo, TabInfo } from "@/shared/types";
import type { WorkspaceAdapter } from "@/features/zen/adapter";

/** An open tab with what identifies it across a restart. */
export interface ListedTab {
  id?: number;
  title?: string;
  url?: string;
  customLabel?: string;
}

export function createTabQuery(workspace: WorkspaceAdapter): {
  queryTabs(anchorTabId?: number): Promise<TabInfo[]>;
  getTabInfo(tabId: number): Promise<TabInfo>;
  getSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
  listAllTabs(): Promise<ListedTab[]>;
} {
  return {
    queryTabs: (anchorTabId) => workspace.listTabs(anchorTabId),
    getTabInfo: (tabId) => workspace.getTab(tabId),
    getSpaces: (anchorTabId) => workspace.listSpaces(anchorTabId),

    /**
     * Every open tab. Firefox's tabs.query leaves out tabs in a Zen space that
     * has not been opened yet, so Zen's list comes first; tabs.query adds the
     * tabs of other windows.
     */
    async listAllTabs() {
      const [zenTabs, browserTabs] = await Promise.all([
        workspace.listTabs().catch(() => []),
        browser.tabs.query({}),
      ]);
      const tabs: ListedTab[] = zenTabs.map(({ id, title, url, customLabel }) => ({
        id: id ?? undefined,
        title,
        url,
        customLabel,
      }));
      const listed = new Set(tabs.map((tab) => tab.id));
      const others = browserTabs.filter((tab) => tab.id !== undefined && !listed.has(tab.id));
      if (others.length === 0) {
        return tabs;
      }
      const labels = await workspace.getCustomLabels(others.map((tab) => tab.id!));
      return [
        ...tabs,
        ...others.map(({ id, title, url }) => ({
          id,
          title,
          url,
          customLabel: labels[id!] ?? "",
        })),
      ];
    },
  };
}
