import { describe, expect, it, vi } from "vitest";
import { createZenWorkspaceAdapter } from "@/features/zen/adapter";
import type { TabInfo } from "@/shared/types";
import { createTabQuery } from "@/features/zen/tabs-query";
import { createTabSwitcher } from "@/features/zen/tabs-switch";

function tab(partial: Partial<TabInfo> & Pick<TabInfo, "id" | "title">): TabInfo {
  return {
    url: "https://example.com",
    favIconUrl: "",
    windowId: 1,
    ...partial,
  };
}

function createFakeAdapter() {
  const tabs = [
    tab({ id: 1, title: "One", workspaceName: "Work" }),
    tab({ id: -1, title: "Essential", domId: "dom-2" }),
  ];
  const spaces = [{ id: "space-a", name: "Work", isActive: true }];

  return createZenWorkspaceAdapter({
    resolveAnchorTabId: async () => 1,
    getZenTabsApi: () => ({
      getAllTabs: async () => tabs,
      getSpaces: async () => spaces,
      getCustomLabels: async () => ({ 1: "Pinned" }),
      activateTab: async (tabId) => tabId === 1,
      activateTabByDomId: async (domId) => domId === "dom-2",
      switchSpace: async (spaceId) => spaceId === "space-a",
      setLabel: async () => true,
      changeLabel: async () => true,
      getDebugInfo: async () => ({ ok: true }),
    }),
    browser: {
      queryTabs: vi.fn(async () => [{ id: 99, title: "Browser only", windowId: 1 }]),
      getTab: vi.fn(async (tabId) => ({
        id: tabId,
        title: "Fallback",
        windowId: 1,
        active: false,
      })),
      focusWindow: vi.fn(async () => undefined),
      activateTab: vi.fn(async () => undefined),
    },
  });
}

describe("createZenWorkspaceAdapter with a fake experiment API", () => {
  it("lists Zen tabs instead of falling back to browser.tabs", async () => {
    const workspace = createFakeAdapter();
    const { queryTabs } = createTabQuery(workspace);
    await expect(queryTabs()).resolves.toEqual([
      expect.objectContaining({ id: 1, title: "One", active: true }),
      expect.objectContaining({ id: -1, title: "Essential", active: false }),
    ]);
  });

  it("activates a tab by DOM id through the fake API", async () => {
    const workspace = createFakeAdapter();
    const { switchToTab } = createTabSwitcher(workspace);
    await expect(switchToTab(undefined, "dom-2")).resolves.toBeUndefined();
  });

  it("throws when the fake space switch fails", async () => {
    const workspace = createFakeAdapter();
    const { switchToSpace } = createTabSwitcher(workspace);
    await expect(switchToSpace("missing")).rejects.toThrow("Could not switch space");
  });
});

describe("createZenWorkspaceAdapter browser fallback", () => {
  it("uses browser.tabs when zenTabs is missing", async () => {
    const activateTab = vi.fn(async () => undefined);
    const focusWindow = vi.fn(async () => undefined);
    const workspace = createZenWorkspaceAdapter({
      getZenTabsApi: () => undefined,
      resolveAnchorTabId: async () => 5,
      browser: {
        queryTabs: async () => [{ id: 5, title: "Local", url: "https://x.test", windowId: 2 }],
        getTab: async (tabId) => ({ id: tabId, title: "Local", windowId: 2, active: true }),
        focusWindow,
        activateTab,
      },
    });

    await expect(workspace.listTabs()).resolves.toEqual([
      expect.objectContaining({ id: 5, title: "Local", active: true, customLabel: "" }),
    ]);
    await workspace.activateTab(5);
    expect(focusWindow).toHaveBeenCalledWith(2);
    expect(activateTab).toHaveBeenCalledWith(5);
  });

  it("falls back to browser.tabs when getAllTabs throws", async () => {
    const workspace = createZenWorkspaceAdapter({
      getZenTabsApi: () => ({
        getAllTabs: async () => {
          throw new Error("zen down");
        },
      }),
      resolveAnchorTabId: async () => 8,
      logDebugInfo: async () => undefined,
      browser: {
        queryTabs: async () => [{ id: 8, title: "Recovered", windowId: 1 }],
        getTab: async (tabId) => ({ id: tabId, windowId: 1 }),
        focusWindow: async () => undefined,
        activateTab: async () => undefined,
      },
    });

    await expect(workspace.listTabs()).resolves.toEqual([
      expect.objectContaining({ id: 8, title: "Recovered" }),
    ]);
  });

  it("keeps the original page title when Zen overwrites the visible label", async () => {
    const workspace = createZenWorkspaceAdapter({
      getZenTabsApi: () => ({
        getAllTabs: async () => [
          {
            id: 1,
            title: "Epic",
            customLabel: "Epic",
            url: "https://example.com",
            favIconUrl: "",
            windowId: 1,
          },
        ],
      }),
      resolveAnchorTabId: async () => 1,
      browser: {
        queryTabs: async () => [
          { id: 1, title: "Follow-up of empty search state", windowId: 1, lastAccessed: 42 },
        ],
        getTab: async (tabId) => ({
          id: tabId,
          title: "Follow-up of empty search state",
          windowId: 1,
        }),
        focusWindow: async () => undefined,
        activateTab: async () => undefined,
      },
    });

    await expect(workspace.listTabs()).resolves.toEqual([
      expect.objectContaining({
        id: 1,
        title: "Follow-up of empty search state",
        customLabel: "Epic",
        lastOpenedAt: 42,
      }),
    ]);
  });
});
