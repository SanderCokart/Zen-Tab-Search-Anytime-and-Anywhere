import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";
import type { FolderInfo, TabInfo } from "@/shared/types";

/**
 * The folders a tab sits in, outermost first. Uses `folderPath` when it already
 * has more than the leaf, otherwise walks `parentId` from the folder list so a
 * nested tab is grouped under its ancestors even when the experiment only named
 * the innermost folder.
 */
export function resolveFolderPath(
  tab: Pick<TabInfo, "folderId" | "folderName" | "folderPath">,
  folders: readonly Pick<ZenFolderInfo, "id" | "name" | "parentId">[],
): FolderInfo[] {
  const reported = tab.folderPath ?? [];
  if (reported.length > 1 || folders.length === 0) {
    return reported;
  }

  const leafId = reported[reported.length - 1]?.id || tab.folderId;
  if (!leafId) {
    return reported;
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const walked: FolderInfo[] = [];
  const seen = new Set<string>();
  let current = byId.get(leafId);
  if (!current && reported.length === 1) {
    return reported;
  }
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    walked.push({ id: current.id, name: current.name });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  if (walked.length === 0) {
    return reported.length
      ? reported
      : tab.folderId
        ? [{ id: tab.folderId, name: tab.folderName || "Folder" }]
        : [];
  }
  return walked.reverse();
}

/** True when the tab sits in `folderId`, or in a folder nested under it. */
export function tabBelongsToFolder(
  tab: Pick<TabInfo, "folderId" | "folderPath">,
  folderId: string,
): boolean {
  if (tab.folderId === folderId) {
    return true;
  }
  return tab.folderPath?.some((folder) => folder.id === folderId) === true;
}

/** Copies each tab with a folder path that includes nested parents. */
export function applyFolderPaths(tabs: TabInfo[], folders: readonly ZenFolderInfo[]): TabInfo[] {
  if (folders.length === 0) {
    return tabs;
  }
  return tabs.map((tab) => {
    const folderPath = resolveFolderPath(tab, folders);
    if (folderPath.length === 0) {
      return tab;
    }
    const leaf = folderPath[folderPath.length - 1]!;
    return {
      ...tab,
      folderPath,
      folderId: leaf.id,
      folderName: leaf.name,
    };
  });
}
