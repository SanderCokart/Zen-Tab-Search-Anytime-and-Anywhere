import { describe, expect, it, vi } from "vitest";
import {
  createBridgeCommandHandler,
  type BridgeWorkspace,
} from "@/features/bridge/background/zen-commands";
import type { TabInfo } from "@/shared/types";

function tab(partial: Partial<TabInfo> & Pick<TabInfo, "id">): TabInfo {
  return {
    title: "Tab",
    url: "https://example.com",
    favIconUrl: "data:image/png;base64,AAAA",
    windowId: 1,
    ...partial,
  };
}

function workspace(partial: Partial<BridgeWorkspace> = {}): BridgeWorkspace {
  return {
    listTabs: async () => [],
    listSelectedTabs: async () => [],
    listSpaces: async () => [],
    listFolders: async () => [],
    activateTab: async () => undefined,
    switchSpace: async () => undefined,
    setLabel: async () => true,
    createFolder: async () => "folder-1",
    renameFolder: async () => undefined,
    moveTabsToFolder: async (tabIds) => tabIds.length,
    removeTabsFromFolder: async (tabIds) => tabIds.length,
    moveTabsToSpace: async (tabIds) => tabIds.length,
    moveTab: async () => undefined,
    openTab: async () => 77,
    closeTab: async () => undefined,
    getTab: async (tabId) => tab({ id: tabId, url: "about:blank", workspaceId: "work" }),
    ...partial,
  };
}

describe("createBridgeCommandHandler", () => {
  it("lists tabs without favicons and filters by space and ancestor folder", async () => {
    const tabs = [
      tab({
        id: 1,
        workspaceId: "work",
        folderId: "child",
        folderPath: [
          { id: "parent", name: "Parent" },
          { id: "child", name: "Child" },
        ],
      }),
      tab({ id: 2, workspaceId: "work" }),
      tab({ id: 3, workspaceId: "home" }),
    ];
    const handle = createBridgeCommandHandler(workspace({ listTabs: async () => tabs }));

    const inParent = (await handle({ type: "listTabs", folderId: "parent" })) as { id: number }[];
    expect(inParent.map((entry) => entry.id)).toEqual([1]);
    expect(inParent[0]).not.toHaveProperty("favIconUrl");

    const inWork = (await handle({ type: "listTabs", spaceId: "work" })) as { id: number }[];
    expect(inWork.map((entry) => entry.id)).toEqual([1, 2]);
  });

  it("renames tabs silently and reports a tab that could not be renamed", async () => {
    const setLabel = vi.fn(async () => true);
    const handle = createBridgeCommandHandler(workspace({ setLabel }));
    await expect(handle({ type: "renameTab", tabId: 5, label: " Docs " })).resolves.toEqual({
      tabId: 5,
      label: "Docs",
    });
    expect(setLabel).toHaveBeenCalledWith("Docs", 5, true);

    const failing = createBridgeCommandHandler(workspace({ setLabel: async () => false }));
    await expect(failing({ type: "renameTab", tabId: 5, label: "x" })).rejects.toThrow(
      "Tab 5 could not be renamed.",
    );
  });

  it("creates folders with no tabs when none are given", async () => {
    const createFolder = vi.fn(async () => "folder-9");
    const handle = createBridgeCommandHandler(workspace({ createFolder }));
    await expect(handle({ type: "createFolder", name: "Reading" })).resolves.toEqual({
      folderId: "folder-9",
    });
    expect(createFolder).toHaveBeenCalledWith("Reading", undefined, []);
  });

  it("maps before/after moves onto the adapter's placement", async () => {
    const moveTab = vi.fn(async () => undefined);
    const handle = createBridgeCommandHandler(workspace({ moveTab }));
    await handle({ type: "moveTabBefore", tabId: 1, targetTabId: 2 });
    await handle({ type: "moveTabAfter", tabId: 1, targetTabId: 3 });
    expect(moveTab).toHaveBeenNthCalledWith(1, 1, { beforeTabId: 2 });
    expect(moveTab).toHaveBeenNthCalledWith(2, 1, { afterTabId: 3 });
  });

  describe("openTab", () => {
    const folders = [
      {
        id: "google",
        name: "Google",
        spaceId: "general",
        spaceName: "General",
        collapsed: false,
      },
    ];

    it("opens in the background, files the tab into the folder and reports the requested URL while loading", async () => {
      const openTab = vi.fn(async () => 77);
      const moveTabsToFolder = vi.fn(async () => 1);
      const activateTab = vi.fn(async () => undefined);
      const handle = createBridgeCommandHandler(
        workspace({
          listFolders: async () => folders,
          openTab,
          moveTabsToFolder,
          activateTab,
          getTab: async (tabId) =>
            tab({
              id: tabId,
              url: "about:blank",
              workspaceId: "general",
              workspaceName: "General",
              folderId: "google",
              folderName: "Google",
              folderPath: [{ id: "google", name: "Google" }],
            }),
        }),
      );

      const result = await handle({
        type: "openTab",
        url: "https://drive.google.com/",
        folderId: "google",
        active: false,
        pinned: false,
      });

      expect(openTab).toHaveBeenCalledWith("https://drive.google.com/", { pinned: false });
      expect(moveTabsToFolder).toHaveBeenCalledWith([77], "google");
      expect(activateTab).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 77,
        url: "https://drive.google.com/",
        spaceId: "general",
        folderId: "google",
      });
    });

    it("refuses a folder from another space before opening anything", async () => {
      const openTab = vi.fn(async () => 77);
      const handle = createBridgeCommandHandler(
        workspace({ listFolders: async () => folders, openTab }),
      );
      await expect(
        handle({
          type: "openTab",
          url: "https://example.com",
          folderId: "google",
          spaceId: "work",
          active: false,
          pinned: false,
        }),
      ).rejects.toThrow('Folder "Google" is in space "General"');
      await expect(
        handle({
          type: "openTab",
          url: "https://example.com",
          folderId: "nope",
          active: false,
          pinned: false,
        }),
      ).rejects.toThrow("Folder not found: nope");
      expect(openTab).not.toHaveBeenCalled();
    });

    it("closes its own tab again when placing it fails", async () => {
      const closeTab = vi.fn(async () => undefined);
      const handle = createBridgeCommandHandler(
        workspace({
          listSpaces: async () => [{ id: "general", name: "General", isActive: false }],
          moveTabsToSpace: async () => {
            throw new Error("Zen spaces API unavailable");
          },
          closeTab,
        }),
      );
      await expect(
        handle({
          type: "openTab",
          url: "https://example.com",
          spaceId: "general",
          active: true,
          pinned: false,
        }),
      ).rejects.toThrow("Zen spaces API unavailable");
      expect(closeTab).toHaveBeenCalledWith(77);
    });

    it("keeps reporting the requested URL while a new tab still shows about:blank", async () => {
      const blank = tab({ id: 77, url: "about:blank", workspaceId: "general" });
      let current = blank;
      const handle = createBridgeCommandHandler(
        workspace({
          listSpaces: async () => [{ id: "general", name: "General", isActive: true }],
          listTabs: async () => [current],
          getTab: async () => current,
        }),
      );
      await handle({
        type: "openTab",
        url: "https://drive.google.com/",
        active: false,
        pinned: false,
      });

      const listed = (await handle({ type: "listTabs" })) as { url: string }[];
      expect(listed[0]?.url).toBe("https://drive.google.com/");

      current = { ...blank, url: "https://drive.google.com/drive/my-drive" };
      const loaded = (await handle({ type: "listTabs" })) as { url: string }[];
      expect(loaded[0]?.url).toBe("https://drive.google.com/drive/my-drive");
    });
  });
});
