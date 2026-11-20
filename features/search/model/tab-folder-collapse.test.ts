import { describe, expect, it } from "vitest";
import { groupSearchItems } from "@/features/search/model/ranking";
import {
  activeCollapsedFolders,
  collectTabFolderKeys,
  isUnderCollapsedFolder,
  tabFolderKey,
} from "@/features/search/model/tab-folder-collapse";
import type { SearchItem, TabInfo } from "@/shared/types";

function tab(id: number, folderPath?: { id: string; name: string }[]): SearchItem {
  const data: TabInfo = {
    id,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    favIconUrl: "",
    windowId: 1,
    ...(folderPath ? { folderPath } : {}),
  };
  return { kind: "tab", data };
}

const docs = { id: "docs", name: "Docs" };
const infra = { id: "infra", name: "Infra" };

describe("tab folder collapse", () => {
  it("names a folder by its id", () => {
    expect(tabFolderKey("docs")).toBe("folder:docs");
  });

  it("hides a tab under a collapsed folder, at any depth", () => {
    const collapsed = new Set([tabFolderKey("docs")]);

    expect(isUnderCollapsedFolder(tab(1, [docs]), collapsed)).toBe(true);
    expect(isUnderCollapsedFolder(tab(2, [docs, infra]), collapsed)).toBe(true);
    expect(isUnderCollapsedFolder(tab(3, [infra]), collapsed)).toBe(false);
    expect(isUnderCollapsedFolder(tab(4), collapsed)).toBe(false);
  });

  it("hides only the sub-folder when just that one is collapsed", () => {
    const collapsed = new Set([tabFolderKey("infra")]);

    expect(isUnderCollapsedFolder(tab(1, [docs]), collapsed)).toBe(false);
    expect(isUnderCollapsedFolder(tab(2, [docs, infra]), collapsed)).toBe(true);
  });

  it("looks only at the top folder when sub-folders are not grouped", () => {
    const collapsed = new Set([tabFolderKey("infra")]);

    expect(isUnderCollapsedFolder(tab(2, [docs, infra]), collapsed, false)).toBe(false);
  });

  it("lists every folder, a parent before its sub-folder", () => {
    const groups = groupSearchItems([tab(1, [docs]), tab(2, [docs, infra]), tab(3)]);

    expect(collectTabFolderKeys(groups)).toEqual(["folder:docs", "folder:infra"]);
  });

  it("keeps the current tab out of a collapsed folder and hides its neighbours", () => {
    const collapsed = new Set([tabFolderKey("docs"), tabFolderKey("infra")]);
    const current = tab(3, [docs, infra]);
    if (current.kind !== "tab") throw new Error("expected a tab item");
    current.data.active = true;

    expect(isUnderCollapsedFolder(current, collapsed)).toBe(false);
    expect(isUnderCollapsedFolder(tab(1, [docs]), collapsed)).toBe(true);
    expect(isUnderCollapsedFolder(tab(2, [docs, infra]), collapsed)).toBe(true);
  });

  it("ignores collapse while a query is active, or when folders are not grouped", () => {
    const collapsed = new Set([tabFolderKey("docs")]);

    expect(activeCollapsedFolders(collapsed, { query: "", groupFolders: true })).toBe(collapsed);
    expect(activeCollapsedFolders(collapsed, { query: "  ", groupFolders: true })).toBe(collapsed);
    expect(activeCollapsedFolders(collapsed, { query: "-", groupFolders: true })).toBe(collapsed);
    expect(activeCollapsedFolders(collapsed, { query: "arch", groupFolders: true }).size).toBe(0);
    expect(activeCollapsedFolders(collapsed, { query: "", groupFolders: false }).size).toBe(0);
  });
});
