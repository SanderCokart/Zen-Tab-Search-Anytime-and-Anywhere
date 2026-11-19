import { buildForgeIssueEntries } from "@/features/search/model/ranking";
import {
  applyForgeFolderPlan,
  countMovableForgeTabs,
  planForgeTabFolders,
  type ForgeOrganizeMode,
} from "@/features/forge/model/forge-tab-organize";
import type { WorkspaceAdapter } from "@/features/zen/adapter";
import type { OrganizeForgeIssueTabsResult, TabInfo } from "@/shared/types";
import { tabBrowserId } from "@/shared/types";

export async function organizeForgeIssueTabs(options: {
  workspace: Pick<
    WorkspaceAdapter,
    "createFolder" | "moveTabsToFolder" | "listFolders" | "moveTab"
  >;
  tabs: TabInfo[];
  mode: ForgeOrganizeMode;
  tabIds?: number[];
  anchorTabId?: number;
}): Promise<OrganizeForgeIssueTabsResult> {
  const allowed = options.tabIds ? new Set(options.tabIds) : undefined;
  const entries = buildForgeIssueEntries(options.tabs).filter((entry) => {
    if (!allowed) {
      return true;
    }
    const id = tabBrowserId(entry.tab);
    return id !== undefined && allowed.has(id);
  });
  const skipped = entries.length - countMovableForgeTabs(entries);
  const plans = planForgeTabFolders(entries, options.mode);
  if (plans.length === 0) {
    return { foldersCreated: 0, tabsMoved: 0, skipped };
  }

  const folders = await options.workspace.listFolders(options.anchorTabId);
  const tabFolders = new Map<number, string | undefined>();
  for (const tab of options.tabs) {
    const id = tabBrowserId(tab);
    if (id !== undefined) {
      tabFolders.set(id, tab.folderId);
    }
  }

  const applied = await applyForgeFolderPlan(plans, folders, options.workspace, {
    anchorTabId: options.anchorTabId,
    tabFolders,
  });
  return { ...applied, skipped };
}
