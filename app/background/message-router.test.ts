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
});
