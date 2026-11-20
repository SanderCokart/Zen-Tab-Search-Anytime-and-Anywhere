import { describe, expect, it, vi } from "vitest";
import {
  dispatchExtensionMessage,
  type MessageRouterHandlers,
} from "@/app/background/message-router";

function handlers(overrides: Partial<MessageRouterHandlers> = {}): MessageRouterHandlers {
  return {
    queryTabs: vi.fn(async () => [
      { id: 1, title: "Tab", url: "https://x.test", favIconUrl: "", windowId: 1 },
    ]),
    getSpaces: vi.fn(async () => []),
    getDebugInfo: vi.fn(async () => ({ ok: true })),
    switchTab: vi.fn(async () => undefined),
    switchSpace: vi.fn(async () => undefined),
    getTab: vi.fn(async () => ({
      id: 1,
      title: "Tab",
      url: "https://x.test",
      favIconUrl: "",
      windowId: 1,
    })),
    getSnapshot: vi.fn(async () => ({ tabs: [], spaces: [], timers: [] })),
    getTimers: vi.fn(async () => []),
    setTimer: vi.fn(async (tabId, endAt) => ({
      tabId,
      endAt,
      originalLabel: "",
      title: "Tab",
    })),
    clearTimer: vi.fn(async () => true),
    clearAllTimers: vi.fn(async () => 0),
    openSettings: vi.fn(async () => undefined),
    openTimerPopup: vi.fn(async () => undefined),
    setTabLabel: vi.fn(async () => undefined),
    setTodo: vi.fn(async () => undefined),
    setTabStatus: vi.fn(async () => undefined),
    clearTodos: vi.fn(async () => undefined),
    getHostOverrides: vi.fn(async () => []),
    setHostOverrides: vi.fn(async (_tabId, groups) => groups),
    getGlobalHostOverrides: vi.fn(async () => []),
    setGlobalHostOverrides: vi.fn(async (groups) => groups),
    getHostProxyStatus: vi.fn(async () => ({ logPath: "", proxies: [] })),
    openHostOverridesPopup: vi.fn(async () => undefined),
    hideOmnibar: vi.fn(async () => undefined),
    getTabZoom: vi.fn(async () => 1.5),
    getUpdateStatus: vi.fn(async () => ({
      currentVersion: "4.0.0",
      latest: null,
      updateAvailable: false,
      demo: false,
      canInstall: false,
      checkedAt: null,
    })),
    getBridgeStatus: vi.fn(async () => ({ connected: false })),
    resetExtensionData: vi.fn(async () => undefined),
    openUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    closeTab: vi.fn(async () => undefined),
    getFolders: vi.fn(async () => []),
    moveTabToFolder: vi.fn(async () => undefined),
    removeTabFromFolder: vi.fn(async () => undefined),
    organizeForgeIssueTabs: vi.fn(async () => ({
      foldersCreated: 0,
      tabsMoved: 0,
      skipped: 0,
    })),
    getPinnedUrl: vi.fn(async () => "https://example.com"),
    setPinnedUrl: vi.fn(async () => undefined),
    replacePinnedUrlWithCurrent: vi.fn(async () => undefined),
    openUrl: vi.fn(async () => undefined),
    isAllowedTimerEnd: vi.fn(() => true),
    ...overrides,
  };
}

describe("dispatchExtensionMessage", () => {
  it("rejects non-object payloads", () => {
    const result = dispatchExtensionMessage(handlers(), null);
    expect(result).toEqual({
      handled: true,
      async: false,
      response: { error: "Invalid message." },
    });
  });

  it("ignores unknown message types", () => {
    const result = dispatchExtensionMessage(handlers(), { type: "toggleOmnibar" });
    expect(result).toEqual({ handled: false });
  });

  it("rejects an invalid known request", () => {
    const result = dispatchExtensionMessage(handlers(), { type: "switchSpace" });
    expect(result).toEqual({
      handled: true,
      async: false,
      response: { error: "Invalid space ID." },
    });
  });

  it("dispatches getTabs", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, { type: "getTabs", anchorTabId: 4 });
    expect(result.handled && result.async).toBe(true);
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await expect(result.promise).resolves.toEqual([
      { id: 1, title: "Tab", url: "https://x.test", favIconUrl: "", windowId: 1 },
    ]);
    expect(api.queryTabs).toHaveBeenCalledWith(4);
  });

  it("uses a usable sender tab as the anchor", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(
      api,
      { type: "getSpaces" },
      { tab: { id: 9, url: "https://example.com" } },
    );
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await result.promise;
    expect(api.getSpaces).toHaveBeenCalledWith(9);
  });

  it("dispatches getSnapshot with the sender tab as the anchor", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(
      api,
      { type: "getSnapshot" },
      { tab: { id: 8, url: "https://example.com" } },
    );
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await result.promise;
    expect(api.getSnapshot).toHaveBeenCalledWith(8);
  });

  it("anchors a sender that is not a tab through anchorTabIdForSender", async () => {
    const api = handlers({ anchorTabIdForSender: vi.fn(() => 12) });
    const sender = { url: "moz-extension://id/omnibar.html?overlay=a" };
    const result = dispatchExtensionMessage(api, { type: "getSnapshot" }, sender);
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await result.promise;
    expect(api.anchorTabIdForSender).toHaveBeenCalledWith(sender);
    expect(api.getSnapshot).toHaveBeenCalledWith(12);
  });

  it("rejects an out-of-range timer before calling the handler", async () => {
    const api = handlers({ isAllowedTimerEnd: () => false });
    const result = dispatchExtensionMessage(api, {
      type: "setTimer",
      tabId: 1,
      endAt: Date.now(),
    });
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await expect(result.promise).resolves.toEqual({
      error: "Timer duration must be between 1 minute and 31 days.",
    });
    expect(api.setTimer).not.toHaveBeenCalled();
  });

  it("wraps clearTimer as a success payload", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, { type: "clearTimer", tabId: 3 });
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await expect(result.promise).resolves.toEqual({ success: true, cleared: true });
  });

  it("dispatches openSettings", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, { type: "openSettings" });
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await expect(result.promise).resolves.toBeUndefined();
    expect(api.openSettings).toHaveBeenCalled();
  });

  it("dispatches setTabLabel", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, {
      type: "setTabLabel",
      tabId: 4,
      label: "Docs",
    });
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await expect(result.promise).resolves.toBeUndefined();
    expect(api.setTabLabel).toHaveBeenCalledWith(4, "Docs");
  });

  it("dispatches setTodo, including clearing it with none", async () => {
    const api = handlers();
    const marked = dispatchExtensionMessage(api, { type: "setTodo", tabId: 4, status: "todo" });
    const cleared = dispatchExtensionMessage(api, { type: "setTodo", tabId: 4, status: "none" });
    if (!marked.handled || !marked.async || !cleared.handled || !cleared.async) {
      throw new Error("expected async dispatch");
    }
    await Promise.all([marked.promise, cleared.promise]);
    expect(api.setTodo).toHaveBeenNthCalledWith(1, 4, "todo");
    expect(api.setTodo).toHaveBeenNthCalledWith(2, 4, "none");
  });

  it("dispatches clearTodos, and close when the UI asked to close the tabs", async () => {
    const api = handlers();
    const cleared = dispatchExtensionMessage(api, { type: "clearTodos", tabIds: [4, 5] });
    const closed = dispatchExtensionMessage(api, {
      type: "clearTodos",
      tabIds: [4],
      close: true,
    });
    if (!cleared.handled || !cleared.async || !closed.handled || !closed.async) {
      throw new Error("expected async dispatch");
    }
    await Promise.all([cleared.promise, closed.promise]);
    expect(api.clearTodos).toHaveBeenNthCalledWith(1, [4, 5], false);
    expect(api.clearTodos).toHaveBeenNthCalledWith(2, [4], true);
  });

  it("asks for the zoom of a content-script sender, and of nothing for any other sender", async () => {
    const api = handlers();
    const fromPage = dispatchExtensionMessage(
      api,
      { type: "getTabZoom" },
      { tab: { id: 12, url: "https://example.com/" } },
    );
    const fromExtension = dispatchExtensionMessage(
      api,
      { type: "getTabZoom" },
      { tab: { id: 13, url: "moz-extension://abc/omnibar.html" } },
    );
    if (!fromPage.handled || !fromPage.async || !fromExtension.handled || !fromExtension.async) {
      throw new Error("expected async dispatch");
    }
    await Promise.all([fromPage.promise, fromExtension.promise]);
    expect(api.getTabZoom).toHaveBeenNthCalledWith(1, 12);
    expect(api.getTabZoom).toHaveBeenNthCalledWith(2, undefined);
  });

  it("dispatches getUpdateStatus, checking now only when forced", async () => {
    const api = handlers();
    const cached = dispatchExtensionMessage(api, { type: "getUpdateStatus" });
    const forced = dispatchExtensionMessage(api, { type: "getUpdateStatus", force: true });
    if (!cached.handled || !cached.async || !forced.handled || !forced.async) {
      throw new Error("expected async dispatch");
    }
    await Promise.all([cached.promise, forced.promise]);
    expect(api.getUpdateStatus).toHaveBeenNthCalledWith(1, false);
    expect(api.getUpdateStatus).toHaveBeenNthCalledWith(2, true);
  });

  it("dispatches getBridgeStatus", async () => {
    const api = handlers({ getBridgeStatus: vi.fn(async () => ({ connected: true })) });
    const result = dispatchExtensionMessage(api, { type: "getBridgeStatus" });
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await expect(result.promise).resolves.toEqual({ connected: true });
  });

  it("dispatches resetExtensionData", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, { type: "resetExtensionData" });
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await result.promise;
    expect(api.resetExtensionData).toHaveBeenCalledOnce();
  });

  it("dispatches closeTab, folder moves and pinned URL updates", async () => {
    const api = handlers();
    const close = dispatchExtensionMessage(api, { type: "closeTab", tabId: 4 });
    const folders = dispatchExtensionMessage(api, { type: "getFolders" });
    const move = dispatchExtensionMessage(api, {
      type: "moveTabToFolder",
      tabId: 4,
      folderId: "docs",
    });
    const organize = dispatchExtensionMessage(api, {
      type: "organizeForgeIssueTabs",
      mode: "tree",
    });
    const replace = dispatchExtensionMessage(api, {
      type: "replacePinnedUrlWithCurrent",
      tabId: 4,
    });
    if (
      !close.handled ||
      !close.async ||
      !folders.handled ||
      !folders.async ||
      !move.handled ||
      !move.async ||
      !organize.handled ||
      !organize.async ||
      !replace.handled ||
      !replace.async
    ) {
      throw new Error("expected async dispatch");
    }
    await Promise.all([
      close.promise,
      folders.promise,
      move.promise,
      organize.promise,
      replace.promise,
    ]);
    expect(api.closeTab).toHaveBeenCalledWith(4);
    expect(api.getFolders).toHaveBeenCalled();
    expect(api.moveTabToFolder).toHaveBeenCalledWith(4, "docs");
    expect(api.organizeForgeIssueTabs).toHaveBeenCalledWith("tree", undefined, undefined);
    expect(api.replacePinnedUrlWithCurrent).toHaveBeenCalledWith(4);
  });

  it("dispatches setTabStatus, including clearing it with none", async () => {
    const api = handlers();
    const lit = dispatchExtensionMessage(api, { type: "setTabStatus", tabId: 4, light: "orange" });
    const unlit = dispatchExtensionMessage(api, { type: "setTabStatus", tabId: 4, light: "none" });
    if (!lit.handled || !lit.async || !unlit.handled || !unlit.async) {
      throw new Error("expected async dispatch");
    }
    await Promise.all([lit.promise, unlit.promise]);
    expect(api.setTabStatus).toHaveBeenNthCalledWith(1, 4, "orange");
    expect(api.setTabStatus).toHaveBeenNthCalledWith(2, 4, "none");
  });

  it("rejects a status color that is not red, orange, green or none", () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, {
      type: "setTabStatus",
      tabId: 4,
      light: "purple",
    });
    expect(result).toEqual({
      handled: true,
      async: false,
      response: { error: "Invalid message." },
    });
    expect(api.setTabStatus).not.toHaveBeenCalled();
  });

  it("rejects a setTodo status that is not todo or none", () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, { type: "setTodo", tabId: 4, status: "done" });
    expect(result).toEqual({
      handled: true,
      async: false,
      response: { error: "Invalid message." },
    });
    expect(api.setTodo).not.toHaveBeenCalled();
  });

  it("dispatches setHostOverrides with normalized groups", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, {
      type: "setHostOverrides",
      tabId: 4,
      groups: [
        {
          id: "a",
          ip: " [::1] ",
          description: " Local ",
          hostnames: ["Example.COM.", "*.example.com"],
          enabled: true,
        },
      ],
    });
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await result.promise;
    expect(api.setHostOverrides).toHaveBeenCalledWith(4, [
      {
        id: "a",
        ip: "::1",
        description: "Local",
        hostnames: ["example.com", "*.example.com"],
        enabled: true,
      },
    ]);
  });

  it("dispatches openUrl", async () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, {
      type: "openUrl",
      url: "https://www.google.com/search?q=tabs",
    });
    if (!result.handled || !result.async) {
      throw new Error("expected async dispatch");
    }
    await expect(result.promise).resolves.toBeUndefined();
    expect(api.openUrl).toHaveBeenCalledWith("https://www.google.com/search?q=tabs");
  });

  it("rejects a host override with an invalid IP", () => {
    const api = handlers();
    const result = dispatchExtensionMessage(api, {
      type: "setHostOverrides",
      tabId: 4,
      groups: [{ id: "a", ip: "999.1.1.1", description: "", hostnames: ["x.test"], enabled: true }],
    });
    expect(result).toEqual({
      handled: true,
      async: false,
      response: { error: "Invalid host override." },
    });
    expect(api.setHostOverrides).not.toHaveBeenCalled();
  });
});
