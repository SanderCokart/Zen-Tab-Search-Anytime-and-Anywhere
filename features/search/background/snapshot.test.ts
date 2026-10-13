import { describe, expect, it, vi } from "vitest";
import { createSnapshotReader } from "@/features/search/background/snapshot";

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
});
