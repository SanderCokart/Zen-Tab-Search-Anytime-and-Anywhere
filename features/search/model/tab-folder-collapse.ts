import { searchItemFolderPath, type SearchItemGroup } from "@/features/search/model/ranking";
import type { SearchItem } from "@/shared/types";

/** Where the collapsed tab folders are kept; disposable UI state, not a setting. */
export const TAB_FOLDER_COLLAPSED_STORAGE_KEY = "tabFolderCollapsed";

/** The collapse key of a tab folder. Zen folder ids are unique, so this names it at any depth. */
export function tabFolderKey(folderId: string): string {
  return `folder:${folderId}`;
}

/** Every folder in the tree, parents before their sub-folders. */
export function collectTabFolderKeys(groups: readonly SearchItemGroup[]): string[] {
  const keys: string[] = [];
  const visit = (group: SearchItemGroup) => {
    if (group.folderId !== undefined) keys.push(tabFolderKey(group.folderId));
    group.children.forEach(visit);
  };
  groups.forEach(visit);
  return keys;
}

/**
 * The folders whose rows are hidden: none while a query is active, so every match
 * shows, and none when tabs are not grouped by folder.
 */
export function activeCollapsedFolders(
  collapsed: ReadonlySet<string>,
  options: { query: string; groupFolders: boolean },
): ReadonlySet<string> {
  return options.query.trim() || !options.groupFolders ? new Set() : collapsed;
}

/**
 * Whether `item` sits under a collapsed folder, at any depth. The current tab
 * never does: its row stays in the list, and the folder shows that row alone.
 */
export function isUnderCollapsedFolder(
  item: SearchItem,
  collapsed: ReadonlySet<string>,
  groupSubfolders = true,
): boolean {
  if (collapsed.size === 0 || isCurrentTab(item)) {
    return false;
  }
  return searchItemFolderPath(item, groupSubfolders).some((folder) =>
    collapsed.has(tabFolderKey(folder.id)),
  );
}

/** The tab the user is looking at, which a collapsed folder still shows. */
export function isCurrentTab(item: SearchItem): boolean {
  return item.kind === "tab" && item.data.active === true;
}
