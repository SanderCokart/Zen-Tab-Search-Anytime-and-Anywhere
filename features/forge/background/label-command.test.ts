import { afterEach, describe, expect, it, vi } from "vitest";
import { changeSelectedTabLabel } from "@/features/forge/background/label-command";
import type { WorkspaceAdapter } from "@/features/zen/adapter";
import type { TabInfo } from "@/shared/types";
import { sendTabMessage } from "@/shared/messaging/client";

vi.mock("@/shared/messaging/client", () => ({
  sendTabMessage: vi.fn(async () => ({})),
}));

const sendTabMessageMock = vi.mocked(sendTabMessage);

function tab(partial: Partial<TabInfo> & Pick<TabInfo, "id" | "title" | "url">): TabInfo {
  return {
    favIconUrl: "",
    windowId: 1,
    ...partial,
  };
}

function workspace(partial: Partial<WorkspaceAdapter> = {}): WorkspaceAdapter {
  return {
    isAvailable: () => true,
    apiMethodNames: () => [],
    resolveAnchorTabId: async () => 1,
    listTabs: async () => [],
    listSelectedTabs: async () => [],
    getTab: async (tabId) => tab({ id: tabId, title: "Tab", url: "" }),
    listSpaces: async () => [],
    getCustomLabels: async () => ({}),
    activateTab: async () => undefined,
    switchSpace: async () => undefined,
    setLabel: async () => true,
    changeLabel: async () => true,
    getDebugInfo: async () => ({}),
    listFolders: async () => [],
    createFolder: async () => "folder",
    renameFolder: async () => undefined,
    moveTabsToFolder: async () => 0,
    removeTabsFromFolder: async () => 0,
    moveTabsToSpace: async () => 0,
    moveTab: async () => undefined,
    openTab: async () => 1,
    closeTab: async () => undefined,
    closeTabs: async () => undefined,
    createSpace: async () => "space-1",
    renameSpace: async () => undefined,
    moveFolder: async () => undefined,
    deleteFolders: async () => undefined,
    deleteSpaces: async () => undefined,
    setEssential: async () => undefined,
    clearEssential: async () => undefined,
    ...partial,
  };
}

describe("changeSelectedTabLabel", () => {
  afterEach(() => {
    sendTabMessageMock.mockReset();
    sendTabMessageMock.mockResolvedValue({});
  });

  it("auto-labels a single GitHub tab and opens the editor", async () => {
    const setLabel = vi.fn(async () => true);
    const changeLabel = vi.fn(async () => true);
    sendTabMessageMock.mockResolvedValue({ title: "Example issue" });

    await changeSelectedTabLabel(
      workspace({
        listSelectedTabs: async () => [
          tab({
            id: 4,
            title: "Example issue (#12)",
            url: "https://github.com/acme/app/issues/12",
            active: true,
          }),
        ],
        setLabel,
        changeLabel,
      }),
    );

    expect(setLabel).toHaveBeenCalledWith("ISSUE: #12 - Example issue", 4, false);
    expect(changeLabel).toHaveBeenCalledWith(4);
  });

  it("auto-labels every selected GitHub and GitLab tab without opening the editor", async () => {
    const setLabel = vi.fn(async () => true);
    const changeLabel = vi.fn(async () => true);
    sendTabMessageMock.mockImplementation(async (tabId) => {
      if (tabId === 5) {
        return { title: "Example change", bodyText: "Closes #41" };
      }
      return { title: "Fix search" };
    });

    await changeSelectedTabLabel(
      workspace({
        listSelectedTabs: async () => [
          tab({
            id: 4,
            title: "Fix search",
            url: "https://github.com/acme/app/issues/12",
            active: true,
          }),
          tab({
            id: 5,
            title: "Example change",
            url: "https://gitlab.com/acme/app/-/merge_requests/8",
          }),
          tab({
            id: 6,
            title: "Docs",
            url: "https://example.com/docs",
          }),
        ],
        setLabel,
        changeLabel,
      }),
    );

    expect(setLabel).toHaveBeenCalledTimes(2);
    expect(setLabel).toHaveBeenCalledWith("ISSUE: #12 - Fix search", 4, true);
    expect(setLabel).toHaveBeenCalledWith("MR: #41 - !8 - Example change", 5, true);
    expect(changeLabel).not.toHaveBeenCalled();
  });

  it("opens the editor when several selected tabs are not forge pages", async () => {
    const setLabel = vi.fn(async () => true);
    const changeLabel = vi.fn(async () => true);

    await changeSelectedTabLabel(
      workspace({
        listSelectedTabs: async () => [
          tab({ id: 4, title: "A", url: "https://example.com/a", active: false }),
          tab({ id: 5, title: "B", url: "https://example.com/b", active: true }),
        ],
        setLabel,
        changeLabel,
      }),
    );

    expect(setLabel).not.toHaveBeenCalled();
    expect(changeLabel).toHaveBeenCalledWith(5);
  });

  it("reads selected tabs from the preferred window", async () => {
    const listSelectedTabs = vi.fn(async () => [
      tab({ id: 20, title: "Second", url: "https://example.com/b", active: true }),
    ]);
    const changeLabel = vi.fn(async () => true);

    await changeSelectedTabLabel(
      workspace({
        listSelectedTabs,
        changeLabel,
      }),
      20,
    );

    expect(listSelectedTabs).toHaveBeenCalledWith(20);
    expect(changeLabel).toHaveBeenCalledWith(20);
  });

  it("does nothing when the Zen API is unavailable", async () => {
    const setLabel = vi.fn(async () => true);
    const changeLabel = vi.fn(async () => true);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await changeSelectedTabLabel(
      workspace({
        isAvailable: () => false,
        setLabel,
        changeLabel,
      }),
    );

    expect(setLabel).not.toHaveBeenCalled();
    expect(changeLabel).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
