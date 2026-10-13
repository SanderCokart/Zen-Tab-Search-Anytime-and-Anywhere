import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";

/** A top-level folder in the space with the same name, ignoring case and surrounding spaces. */
export function findReusableFolder(
  folders: ZenFolderInfo[],
  name: string,
  spaceId: string,
): ZenFolderInfo | undefined {
  const wanted = name.trim().toLowerCase();
  return folders.find(
    (folder) =>
      folder.spaceId === spaceId && !folder.parentId && folder.name.trim().toLowerCase() === wanted,
  );
}
