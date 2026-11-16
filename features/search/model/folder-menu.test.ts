import { describe, expect, it } from "vitest";
import { folderMenuLabel, foldersForMenu } from "@/features/search/model/folder-menu";
import type { OverlayFolderInfo } from "@/shared/messaging/protocol";

const folders: OverlayFolderInfo[] = [
  { id: "docs", name: "Docs", spaceId: "s", spaceName: "Work", collapsed: false },
  {
    id: "infra",
    name: "Infra",
    spaceId: "s",
    spaceName: "Work",
    parentId: "docs",
    collapsed: false,
  },
];

describe("folderMenuLabel", () => {
  it("joins the space and nested folder names", () => {
    expect(folderMenuLabel(folders, folders[1]!)).toBe("Work · Docs / Infra");
  });
});

describe("foldersForMenu", () => {
  it("sorts folders by that label", () => {
    expect(foldersForMenu(folders).map((folder) => folder.id)).toEqual(["docs", "infra"]);
  });
});
