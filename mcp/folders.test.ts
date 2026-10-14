import { describe, expect, it } from "vitest";
import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";
import { findFoldersByPath, findReusableFolder, folderPath, requireFolder } from "./folders";

function folder(
  partial: Partial<ZenFolderInfo> & Pick<ZenFolderInfo, "id" | "name">,
): ZenFolderInfo {
  return {
    spaceId: "work",
    spaceName: "Work",
    collapsed: false,
    ...partial,
  };
}

const folders: ZenFolderInfo[] = [
  folder({ id: "repo", name: "repo" }),
  folder({ id: "master-repo", name: "master", parentId: "repo" }),
  folder({ id: "other", name: "other" }),
  folder({ id: "master-other", name: "master", parentId: "other" }),
  folder({
    id: "home-master",
    name: "master",
    spaceId: "home",
    spaceName: "Home",
  }),
];

describe("folderPath", () => {
  it("includes the space and ancestor folders", () => {
    expect(folderPath(folders, folders[1]!)).toBe("Work / repo / master");
    expect(folderPath(folders, folders[4]!)).toBe("Home / master");
  });
});

describe("findReusableFolder", () => {
  it("matches by name in the same place, ignoring case", () => {
    expect(findReusableFolder(folders, "REPO", "work")?.id).toBe("repo");
    expect(findReusableFolder(folders, "master", "work", "repo")?.id).toBe("master-repo");
    expect(findReusableFolder(folders, "master", "work")).toBeUndefined();
  });
});

describe("findFoldersByPath", () => {
  it("matches a unique full path or a unique suffix", () => {
    expect(findFoldersByPath(folders, "Work / repo / master").map((entry) => entry.id)).toEqual([
      "master-repo",
    ]);
    expect(findFoldersByPath(folders, "repo / master").map((entry) => entry.id)).toEqual([
      "master-repo",
    ]);
  });

  it("returns every folder when the path is an ambiguous name", () => {
    expect(
      findFoldersByPath(folders, "master")
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(["home-master", "master-other", "master-repo"]);
  });
});

describe("requireFolder", () => {
  it("resolves a unique path and rejects an ambiguous one with the matches", () => {
    expect(requireFolder(folders, { path: "Work / repo / master" }).id).toBe("master-repo");
    expect(() => requireFolder(folders, { path: "master" })).toThrow(/matches 3 folders/);
    expect(() => requireFolder(folders, { path: "missing" })).toThrow(/No folder matches path/);
  });

  it("resolves by id and checks it against a path when both are given", () => {
    expect(requireFolder(folders, { folderId: "master-repo" }).id).toBe("master-repo");
    expect(() =>
      requireFolder(folders, { folderId: "master-repo", path: "Home / master" }),
    ).toThrow(/not "Home \/ master"/);
  });
});
