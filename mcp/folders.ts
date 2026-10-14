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

export function parseFolderPath(path: string): string[] {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Folders whose path equals `path`, or whose path ends with it, ignoring case.
 * `"master"` matches every folder of that name; `"Work / repo / master"` picks one.
 */
export function findFoldersByPath(folders: ZenFolderInfo[], path: string): ZenFolderInfo[] {
  const segments = parseFolderPath(path).map((part) => part.toLowerCase());
  if (segments.length === 0) {
    return [];
  }
  return folders.filter((folder) => {
    const full = folderPath(folders, folder)
      .split(" / ")
      .map((part) => part.toLowerCase());
    if (full.length < segments.length) {
      return false;
    }
    const suffix = full.slice(-segments.length);
    return suffix.every((name, index) => name === segments[index]);
  });
}

/** Resolve a folder from an id, a path, or both (they must agree). */
export function requireFolder(
  folders: ZenFolderInfo[],
  input: { folderId?: string; path?: string },
): ZenFolderInfo {
  if (input.folderId) {
    const folder = folders.find((entry) => entry.id === input.folderId);
    if (!folder) {
      throw new Error(
        `Folder not found: ${input.folderId}. Get folder IDs and paths from zen_list_folders.`,
      );
    }
    if (input.path) {
      const matches = findFoldersByPath(folders, input.path);
      if (!matches.some((entry) => entry.id === folder.id)) {
        throw new Error(
          `Folder ${input.folderId} is "${folderPath(folders, folder)}", not "${input.path}".`,
        );
      }
    }
    return folder;
  }

  if (input.path) {
    const matches = findFoldersByPath(folders, input.path);
    const first = matches[0];
    if (matches.length === 1 && first) {
      return first;
    }
    if (matches.length === 0) {
      throw new Error(
        `No folder matches path "${input.path}". Get paths from zen_list_folders, for example "Work / repo / master".`,
      );
    }
    const listed = matches.map((entry) => `${folderPath(folders, entry)} (${entry.id})`).join("; ");
    throw new Error(
      `Path "${input.path}" matches ${String(matches.length)} folders: ${listed}. Pass folderId to pick one.`,
    );
  }

  throw new Error("Pass folderId or path. Get both from zen_list_folders.");
}
