import type { OverlayFolderInfo } from "@/shared/messaging/protocol";

/** Space name plus nested folder names, for the Move to folder submenu. */
export function folderMenuLabel(folders: OverlayFolderInfo[], folder: OverlayFolderInfo): string {
  const byId = new Map(folders.map((entry) => [entry.id, entry]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current: OverlayFolderInfo | undefined = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  const path = parts.join(" / ");
  return folder.spaceName ? `${folder.spaceName} · ${path}` : path;
}

export function foldersForMenu(folders: OverlayFolderInfo[]): OverlayFolderInfo[] {
  return [...folders].sort((left, right) =>
    folderMenuLabel(folders, left).localeCompare(folderMenuLabel(folders, right)),
  );
}
