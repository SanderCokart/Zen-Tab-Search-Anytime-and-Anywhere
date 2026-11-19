import { describe, expect, it } from "vitest";
import { applyFolderPaths, resolveFolderPath, tabBelongsToFolder } from "@/features/zen/folder-path";
import type { TabInfo } from "@/shared/types";

const docs = { id: "docs", name: "Docs", spaceId: "s", spaceName: "Work", collapsed: false };
const infra = {
  id: "infra",
  name: "Infra",
  spaceId: "s",
  spaceName: "Work",
  parentId: "docs",
  collapsed: false,
};

describe("resolveFolderPath", () => {
  it("keeps a path that already includes ancestors", () => {
    expect(
      resolveFolderPath(
        {
          folderPath: [
            { id: "docs", name: "Docs" },
            { id: "infra", name: "Infra" },
          ],
        },
        [docs, infra],
      ),
    ).toEqual([
      { id: "docs", name: "Docs" },
      { id: "infra", name: "Infra" },
    ]);
  });

  it("walks parentId when only the leaf folder was reported", () => {
    expect(resolveFolderPath({ folderId: "infra", folderName: "Infra" }, [docs, infra])).toEqual([
      { id: "docs", name: "Docs" },
      { id: "infra", name: "Infra" },
    ]);
    expect(
      resolveFolderPath({ folderPath: [{ id: "infra", name: "Infra" }] }, [docs, infra]),
    ).toEqual([
      { id: "docs", name: "Docs" },
      { id: "infra", name: "Infra" },
    ]);
  });

  it("leaves a tab with no folder alone", () => {
    expect(resolveFolderPath({}, [docs, infra])).toEqual([]);
  });
});

describe("tabBelongsToFolder", () => {
  it("matches the leaf folder and any ancestor on the path", () => {
    const tab = {
      folderId: "infra",
      folderPath: [
        { id: "docs", name: "Docs" },
        { id: "infra", name: "Infra" },
      ],
    };
    expect(tabBelongsToFolder(tab, "infra")).toBe(true);
    expect(tabBelongsToFolder(tab, "docs")).toBe(true);
    expect(tabBelongsToFolder(tab, "other")).toBe(false);
    expect(tabBelongsToFolder({}, "docs")).toBe(false);
  });
});

describe("applyFolderPaths", () => {
  it("fills nested paths on the tabs that need them", () => {
    const tab: TabInfo = {
      id: 1,
      title: "Gamma",
      url: "https://example.com",
      favIconUrl: "",
      windowId: 1,
      folderId: "infra",
      folderName: "Infra",
    };
    expect(applyFolderPaths([tab], [docs, infra])[0]).toMatchObject({
      folderId: "infra",
      folderName: "Infra",
      folderPath: [
        { id: "docs", name: "Docs" },
        { id: "infra", name: "Infra" },
      ],
    });
  });
});
