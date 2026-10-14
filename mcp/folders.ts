import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";

/**
 * A folder with the same name in the same place, ignoring case and surrounding
 * spaces. `parentId` omitted matches a top-level folder; pass the parent folder
 * id to reuse a nested folder instead.
 */
export function findReusableFolder(
  folders: ZenFolderInfo[],
  name: string,
  spaceId: string,
  parentId?: string,
): ZenFolderInfo | undefined {
  const wanted = name.trim().toLowerCase();
  const parent = parentId ?? undefined;
  return folders.find(
    (folder) =>
      folder.spaceId === spaceId &&
      (folder.parentId ?? undefined) === parent &&
      folder.name.trim().toLowerCase() === wanted,
  );
}
