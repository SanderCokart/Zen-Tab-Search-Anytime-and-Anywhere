import { describe, expect, it, vi } from "vitest";
import { organizeForgeIssueTabs } from "@/features/forge/background/forge-tab-organize-service";
import type { TabInfo } from "@/shared/types";

function tab(partial: Partial<TabInfo> & Pick<TabInfo, "id" | "url">): TabInfo {
  return {
    title: "Untitled",
    favIconUrl: "",
    windowId: 1,
    workspaceId: "work",
    ...partial,
  };
}

describe("organizeForgeIssueTabs", () => {
  it("creates the overlay tree and moves movable tabs into it", async () => {
    const createFolder = vi.fn(async (name: string) => `id:${name}`);
    const moveTabsToFolder = vi.fn(async (tabIds: number[]) => tabIds.length);
    const listFolders = vi.fn(async () => []);

    const result = await organizeForgeIssueTabs({
      workspace: { createFolder, moveTabsToFolder, listFolders },
      mode: "tree",
      tabs: [
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/4",
          customLabel: "ISSUE: #4 - Login",
        }),
        tab({
          id: 2,
          url: "https://gitlab.com/acme/app/-/merge_requests/8",
          customLabel: "MR: #4 - !8 - Login",
          forgeTargetBranch: "main",
        }),
        tab({
          id: 3,
          url: "https://gitlab.com/acme/app/-/issues/9",
          essential: true,
        }),
      ],
    });

    expect(listFolders).toHaveBeenCalledOnce();
    expect(createFolder.mock.calls.map((call) => call[0])).toEqual([
      "app",
      "Issues",
      "MRs",
      "main",
    ]);
    expect(moveTabsToFolder).toHaveBeenCalledWith([1], "id:Issues");
    expect(moveTabsToFolder).toHaveBeenCalledWith([2], "id:main");
    expect(result).toEqual({ foldersCreated: 4, tabsMoved: 2, skipped: 1 });
  });

  it("returns zeros when there are no forge tabs to place", async () => {
    const workspace = {
      createFolder: vi.fn(async () => "x"),
      moveTabsToFolder: vi.fn(async () => 0),
      listFolders: vi.fn(async () => []),
    };
    await expect(
      organizeForgeIssueTabs({
        workspace,
        mode: "tree",
        tabs: [tab({ id: 1, url: "https://example.com" })],
      }),
    ).resolves.toEqual({ foldersCreated: 0, tabsMoved: 0, skipped: 0 });
    expect(workspace.listFolders).not.toHaveBeenCalled();
  });

  it("only places the tabs named in tabIds", async () => {
    const createFolder = vi.fn(async (name: string) => `id:${name}`);
    const moveTabsToFolder = vi.fn(async (tabIds: number[]) => tabIds.length);
    const result = await organizeForgeIssueTabs({
      workspace: { createFolder, moveTabsToFolder, listFolders: vi.fn(async () => []) },
      mode: "tree",
      tabIds: [1],
      tabs: [
        tab({ id: 1, url: "https://gitlab.com/acme/app/-/issues/4" }),
        tab({
          id: 2,
          url: "https://gitlab.com/acme/app/-/merge_requests/8",
          forgeTargetBranch: "main",
        }),
      ],
    });
    expect(moveTabsToFolder).toHaveBeenCalledWith([1], "id:Issues");
    expect(moveTabsToFolder).not.toHaveBeenCalledWith([2], expect.anything());
    expect(result.tabsMoved).toBe(1);
  });

  it("only rearranges forge tabs inside the clicked folder", async () => {
    const createFolder = vi.fn(async (name: string) => `id:${name}`);
    const moveTabsToFolder = vi.fn(async (tabIds: number[]) => tabIds.length);
    const result = await organizeForgeIssueTabs({
      workspace: { createFolder, moveTabsToFolder, listFolders: vi.fn(async () => []) },
      mode: "tree",
      parentFolderId: "work",
      tabs: [
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/4",
          folderId: "work",
          folderPath: [{ id: "work", name: "Work" }],
        }),
        tab({
          id: 2,
          url: "https://gitlab.com/acme/app/-/merge_requests/8",
          forgeTargetBranch: "main",
          folderId: "work",
          folderPath: [{ id: "work", name: "Work" }],
        }),
        tab({
          id: 3,
          url: "https://gitlab.com/acme/other/-/issues/1",
          folderId: "other",
        }),
      ],
    });
    expect(createFolder.mock.calls.map((call) => call.slice(0, 4))).toEqual([
      ["Issues", "work", [], "work"],
      ["MRs", "work", [], "work"],
      ["main", "work", [], "id:MRs"],
    ]);
    expect(moveTabsToFolder).not.toHaveBeenCalledWith([3], expect.anything());
    expect(result.tabsMoved).toBe(2);
  });
});
