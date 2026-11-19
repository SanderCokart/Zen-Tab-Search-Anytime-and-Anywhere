import { buildForgeIssueEntries } from "@/features/search/model/ranking";
import {
  applyForgeFolderPlan,
  countMovableForgeTabs,
  planForgeTabFolders,
  plansForParentFolder,
  type ForgeOrganizeMode,
} from "@/features/forge/model/forge-tab-organize";
import type { WorkspaceAdapter } from "@/features/zen/adapter";
import { tabBelongsToFolder } from "@/features/zen/folder-path";
import type { OrganizeForgeIssueTabsResult, TabInfo } from "@/shared/types";
import { tabBrowserId } from "@/shared/types";

export async function organizeForgeIssueTabs(options: {
  workspace: Pick<WorkspaceAdapter, "createFolder" | "moveTabsToFolder" | "listFolders"> &
    Pick<Partial<WorkspaceAdapter>, "moveTab">;
  tabs: TabInfo[];
  mode: ForgeOrganizeMode;
  tabIds?: number[];
  /** Only tabs in this folder (or nested under it); create the tree inside it. */
  parentFolderId?: string;
  anchorTabId?: number;
}): Promise<OrganizeForgeIssueTabsResult> {
  const allowed = options.tabIds ? new Set(options.tabIds) : undefined;
  const parentFolderId = options.parentFolderId;
  const scopedTabs = parentFolderId
    ? options.tabs.filter((tab) => tabBelongsToFolder(tab, parentFolderId))
    : options.tabs;
  const entries = buildForgeIssueEntries(scopedTabs).filter((entry) => {
    if (!allowed) {
      return true;
    }
    const id = tabBrowserId(entry.tab);
    return id !== undefined && allowed.has(id);
  });
  const skipped = entries.length - countMovableForgeTabs(entries);
  const planned = planForgeTabFolders(entries, options.mode);
  const plans = parentFolderId ? plansForParentFolder(planned) : planned;
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
    parentId: parentFolderId,
  });
  return { ...applied, skipped };
}
