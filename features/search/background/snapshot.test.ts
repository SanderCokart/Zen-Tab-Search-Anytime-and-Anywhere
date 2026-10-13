import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCachedSnapshotReader,
  createSnapshotReader,
  registerSnapshotChangeNotifications,
} from "@/features/search/background/snapshot";

describe("createSnapshotReader", () => {
  it("loads tabs, spaces, and timers in one payload", async () => {
    const getSnapshot = createSnapshotReader({
      queryTabs: vi.fn(async (anchorTabId) => [
        { id: anchorTabId ?? 1, title: "Tab", url: "https://x.test", favIconUrl: "", windowId: 1 },
      ]),
      getSpaces: vi.fn(async () => [{ id: "space-a", name: "Work", isActive: true }]),
      getTimers: vi.fn(async () => [{ tabId: 1, endAt: 99, originalLabel: "", title: "Tab" }]),
    });

    await expect(getSnapshot(4)).resolves.toEqual({
      tabs: [{ id: 4, title: "Tab", url: "https://x.test", favIconUrl: "", windowId: 1 }],
      spaces: [{ id: "space-a", name: "Work", isActive: true }],
      timers: [{ tabId: 1, endAt: 99, originalLabel: "", title: "Tab" }],
      todos: [],
    });
  });

  it("asks for todos for the browser IDs of the open tabs", async () => {
    const getTodos = vi.fn(async () => [{ tabId: 4, status: "todo" as const }]);
    const getSnapshot = createSnapshotReader({
      queryTabs: vi.fn(async () => [
        { id: 4, title: "Tab", url: "https://x.test", favIconUrl: "", windowId: 1 },
        { id: null, title: "Essential", url: "https://x.test", favIconUrl: "", windowId: 1 },
      ]),
      getSpaces: vi.fn(async () => []),
      getTimers: vi.fn(async () => []),
      getTodos,
    });

    const snapshot = await getSnapshot();

    expect(getTodos).toHaveBeenCalledWith([4]);
    expect(snapshot.todos).toEqual([{ tabId: 4, status: "todo" }]);
  });

  it("merges stored last-opened times onto tabs", async () => {
    const getSnapshot = createSnapshotReader({
      queryTabs: vi.fn(async () => [
        {
          id: 2,
          title: "Issue",
          url: "https://x.test",
          favIconUrl: "",
          windowId: 1,
          lastOpenedAt: 50,
        },
      ]),
      getSpaces: vi.fn(async () => []),
      getTimers: vi.fn(async () => []),
      readLastOpened: vi.fn(async () => ({ "2": 200 })),
    });

    await expect(getSnapshot()).resolves.toMatchObject({
      tabs: [{ id: 2, lastOpenedAt: 200 }],
    });
  });

  it("passes open tab ids to getTimers so it does not query tabs again", async () => {
    const getTimers = vi.fn(async () => []);
    const getSnapshot = createSnapshotReader({
      queryTabs: vi.fn(async () => [
        { id: 4, title: "Tab", url: "https://x.test", favIconUrl: "", windowId: 1 },
      ]),
      getSpaces: vi.fn(async () => []),
      getTimers,
    });

    await getSnapshot();
    expect(getTimers).toHaveBeenCalledWith([4]);
  });
});

describe("createCachedSnapshotReader", () => {
  it("reuses the last payload until it is invalidated", async () => {
    const read = vi.fn(async () => ({
      tabs: [],
      spaces: [],
      timers: [],
      todos: [],
    }));
    const cache = createCachedSnapshotReader(read);

    await cache.getSnapshot(1);
    await cache.getSnapshot(1);
    expect(read).toHaveBeenCalledTimes(1);

    cache.invalidate();
    await cache.getSnapshot(1);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe("registerSnapshotChangeNotifications", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function installBrowser() {
    const sendMessage = vi.fn(async () => undefined);
    const listeners: {
      onUpdated?: (tabId: number, changeInfo: Record<string, unknown>) => void;
    } = {};
    const addListener = vi.fn();
    const removeListener = vi.fn();

    Object.assign(globalThis, {
      browser: {
        runtime: { sendMessage },
        storage: { onChanged: { addListener, removeListener } },
        tabs: {
          onCreated: { addListener, removeListener },
          onRemoved: { addListener, removeListener },
          onUpdated: {
            addListener: (
              listener: (tabId: number, changeInfo: Record<string, unknown>) => void,
            ) => {
              listeners.onUpdated = listener;
            },
            removeListener,
          },
          onActivated: { addListener, removeListener },
          onMoved: { addListener, removeListener },
        },
      },
    });

    return { sendMessage, listeners };
  }

  it("notifies on url or title changes, not favicon or load-complete", () => {
    vi.useFakeTimers();
    const { sendMessage, listeners } = installBrowser();
    const stop = registerSnapshotChangeNotifications(150);

    listeners.onUpdated?.(1, { favIconUrl: "https://x.test/icon.png" });
    listeners.onUpdated?.(1, { status: "complete" });
    vi.advanceTimersByTime(150);
    expect(sendMessage).not.toHaveBeenCalled();

    listeners.onUpdated?.(1, { url: "https://x.test/next" });
    vi.advanceTimersByTime(150);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    listeners.onUpdated?.(1, { title: "New title" });
    vi.advanceTimersByTime(150);
    expect(sendMessage).toHaveBeenCalledTimes(2);

    stop();
  });
});
