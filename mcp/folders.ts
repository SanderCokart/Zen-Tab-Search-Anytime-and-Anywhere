import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";

/** Space name, then ancestor folders, then this folder: `Work / repo / master`. */
export function folderPath(folders: ZenFolderInfo[], folder: ZenFolderInfo): string {
  const byId = new Map(folders.map((entry) => [entry.id, entry]));
  const names: string[] = [];
  let current: ZenFolderInfo | undefined = folder;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return [folder.spaceName, ...names].filter((part) => part.trim().length > 0).join(" / ");
}
