import { describe, expect, it } from "vitest";
import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";
import { folderPath } from "./folders";

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
    expect(folderPath(folders, folders[2]!)).toBe("Home / master");
  });
});
