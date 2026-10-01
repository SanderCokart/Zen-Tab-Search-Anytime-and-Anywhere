import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isUsableBrowserTabId,
  isUsableWindowId,
  resolveAnchorTabId,
  zenAnchorTabId,
} from "@/features/zen/anchor";

type QueryInfo = {
  active?: boolean;
  lastFocusedWindow?: boolean;
  currentWindow?: boolean;
  windowId?: number;
};

function installBrowser(options: {
  tabs?: Array<{ id: number; url?: string; windowId?: number }>;
  lastFocused?: { id?: number; type?: string } | Error;
}) {
  const tabs = options.tabs ?? [];
  Object.assign(globalThis, {
    browser: {
      tabs: {
        get: vi.fn(async (tabId: number) => {
          const tab = tabs.find((item) => item.id === tabId);
          if (!tab) {
            throw new Error("No such tab");
          }
          return tab;
        }),
        query: vi.fn(async (query: QueryInfo) => {
          return tabs.filter((tab) => {
            if (query.windowId !== undefined && tab.windowId !== query.windowId) {
              return false;
            }
            return true;
          });
        }),
      },
      windows: {
        getLastFocused: vi.fn(async () => {
          if (options.lastFocused instanceof Error) {
            throw options.lastFocused;
          }
          return options.lastFocused ?? { id: 1, type: "normal" };
        }),
      },
    },
  });
}

describe("zenAnchorTabId", () => {
  it("passes through a usable tab id and falls back to -1", () => {
    expect(zenAnchorTabId(12)).toBe(12);
    expect(zenAnchorTabId(-1)).toBe(-1);
    expect(zenAnchorTabId(undefined)).toBe(-1);
  });
});

describe("isUsableBrowserTabId", () => {
  it("requires a non-negative id that is not an extension page", () => {
    expect(isUsableBrowserTabId(3, "https://example.com")).toBe(true);
    expect(isUsableBrowserTabId(-1, "https://example.com")).toBe(false);
    expect(isUsableBrowserTabId(3, "moz-extension://abc/popup.html")).toBe(false);
  });
});

describe("isUsableWindowId", () => {
  it("rejects missing and negative window ids", () => {
    expect(isUsableWindowId(2)).toBe(true);
    expect(isUsableWindowId(-1)).toBe(false);
    expect(isUsableWindowId(undefined)).toBe(false);
  });
});

describe("resolveAnchorTabId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the last focused normal window instead of the first window's active tab", async () => {
    installBrowser({
      lastFocused: { id: 2, type: "normal" },
      tabs: [
        { id: 10, url: "https://first.test", windowId: 1 },
        { id: 20, url: "https://second.test", windowId: 2 },
      ],
    });

    await expect(resolveAnchorTabId()).resolves.toBe(20);
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, windowId: 2 });
  });

  it("ignores a focused popup and keeps looking for a normal window", async () => {
    installBrowser({
      lastFocused: { id: 9, type: "popup" },
      tabs: [
        { id: 10, url: "https://first.test", windowId: 1 },
        { id: 20, url: "https://second.test", windowId: 2 },
      ],
    });

    const query = vi.mocked(browser.tabs.query);
    query.mockImplementation(async (info: QueryInfo) => {
      if (info.lastFocusedWindow || info.currentWindow) {
        return [{ id: 20, url: "https://second.test", windowId: 2 }];
      }
      return [
        { id: 10, url: "https://first.test", windowId: 1 },
        { id: 20, url: "https://second.test", windowId: 2 },
      ];
    });

    await expect(resolveAnchorTabId()).resolves.toBe(20);
    expect(query).not.toHaveBeenCalledWith({ active: true });
  });

  it("does not pick the first window when no focused window is available", async () => {
    installBrowser({
      lastFocused: new Error("no focused window"),
      tabs: [
        { id: 10, url: "https://first.test", windowId: 1 },
        { id: 20, url: "https://second.test", windowId: 2 },
      ],
    });

    const query = vi.mocked(browser.tabs.query);
    query.mockImplementation(async (info: QueryInfo) => {
      if (info.lastFocusedWindow || info.currentWindow) {
        return [];
      }
      return [
        { id: 10, url: "https://first.test", windowId: 1 },
        { id: 20, url: "https://second.test", windowId: 2 },
      ];
    });

    await expect(resolveAnchorTabId()).resolves.toBeUndefined();
  });

  it("prefers a usable preferred tab over window lookup", async () => {
    installBrowser({
      lastFocused: { id: 1, type: "normal" },
      tabs: [
        { id: 10, url: "https://first.test", windowId: 1 },
        { id: 20, url: "https://second.test", windowId: 2 },
      ],
    });

    await expect(resolveAnchorTabId(20)).resolves.toBe(20);
    expect(browser.tabs.query).not.toHaveBeenCalled();
  });
});
