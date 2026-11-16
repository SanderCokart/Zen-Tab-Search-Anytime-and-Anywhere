import { searchItemFolderPath } from "@/features/search/model/ranking";
import type { SearchItem } from "@/shared/types";

/** Where the collapsed tab folders are kept; disposable UI state, not a setting. */
export const TAB_FOLDER_COLLAPSED_STORAGE_KEY = "tabFolderCollapsed";

/** The collapse key of a tab folder. Zen folder ids are unique, so this names it at any depth. */
export function tabFolderKey(folderId: string): string {
  return `folder:${folderId}`;
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

/** Whether `item` sits under a collapsed folder, at any depth. */
export function isUnderCollapsedFolder(
  item: SearchItem,
  collapsed: ReadonlySet<string>,
  groupSubfolders = true,
): boolean {
  if (collapsed.size === 0) {
    return false;
  }
  return searchItemFolderPath(item, groupSubfolders).some((folder) =>
    collapsed.has(tabFolderKey(folder.id)),
  );
}
