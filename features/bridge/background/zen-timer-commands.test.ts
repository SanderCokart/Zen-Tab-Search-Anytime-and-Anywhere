import { describe, expect, it, vi } from "vitest";
import {
  createBridgeCommandHandler,
  type BridgeServices,
  type BridgeWorkspace,
} from "@/features/bridge/background/zen-commands";
import type { TabInfo, TabTimer, TabTodo, TodoStatus } from "@/shared/types";

function workspace(tabs: TabInfo[] = []): BridgeWorkspace {
  return {
    listTabs: async () => tabs,
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
    openTab: async () => 1,
    closeTab: async () => undefined,
    getTab: async () => {
      throw new Error("unused");
    },
  };
}

function timer(tabId: number, endAt: number): TabTimer {
  return { tabId, endAt, originalLabel: "Docs", title: "Docs" };
}

function services(
  partial: Partial<BridgeServices["timers"]> = {},
  todos: Partial<BridgeServices["todos"]> = {},
): BridgeServices {
  return {
    timers: {
      setTabTimer: vi.fn(async (tabId: number, endAt: number) => timer(tabId, endAt)),
      clearTabTimer: vi.fn(async () => true),
      getActiveTimers: vi.fn(async () => []),
      ...partial,
    },
    todos: {
      setTodo: vi.fn(async () => undefined),
      getTodos: vi.fn(async () => []),
      ...todos,
    },
    detectForgeLabels: vi.fn(async () => []),
  };
}

describe("bridge timer commands", () => {
  it("sets a timer from the same text the timer popup accepts", async () => {
    const svc = services();
    const handle = createBridgeCommandHandler(workspace(), svc);
    const before = Date.now();

    const result = (await handle({ type: "setTimer", tabId: 9, when: "30m" })) as {
      tabId: number;
      endAt: number;
      endsAt: string;
    };

    expect(result.tabId).toBe(9);
    const endAt = vi.mocked(svc.timers.setTabTimer).mock.calls[0]?.[1] ?? 0;
    expect(endAt - before).toBeGreaterThan(29 * 60_000);
    expect(endAt - before).toBeLessThan(31 * 60_000);
    expect(result.endsAt).toBe(new Date(result.endAt).toISOString());
  });

  it("rejects text it cannot read as a time, without touching the timer service", async () => {
    const svc = services();
    const handle = createBridgeCommandHandler(workspace(), svc);

    await expect(handle({ type: "setTimer", tabId: 9, when: "whenever" })).rejects.toThrow(
      'Could not read "whenever" as a time.',
    );
    expect(svc.timers.setTabTimer).not.toHaveBeenCalled();
  });

  it("lists active timers and reports whether a clear removed one", async () => {
    const endAt = Date.now() + 60_000;
    const svc = services({ getActiveTimers: async () => [timer(4, endAt)] });
    const handle = createBridgeCommandHandler(workspace(), svc);

    const listed = (await handle({ type: "listTimers" })) as { tabId: number; label: string }[];
    expect(listed).toEqual([expect.objectContaining({ tabId: 4, label: "Docs" })]);

    await expect(handle({ type: "clearTimer", tabId: 4 })).resolves.toEqual({
      tabId: 4,
      cleared: true,
    });
  });

  it("reports a clear of a tab without a timer as cleared: false", async () => {
    const svc = services({ clearTabTimer: async () => false });
    const handle = createBridgeCommandHandler(workspace(), svc);
    await expect(handle({ type: "clearTimer", tabId: 4 })).resolves.toEqual({
      tabId: 4,
      cleared: false,
    });
  });

  it("fails clearly when the handler was built without timer services", async () => {
    const handle = createBridgeCommandHandler(workspace());
    await expect(handle({ type: "listTimers" })).rejects.toThrow(
      "timers are not available in this context.",
    );
  });
});

describe("bridge forge detection", () => {
  const tabs: TabInfo[] = [
    { id: 1, title: "A", url: "https://github.com/acme/app/pull/12", favIconUrl: "", windowId: 1 },
    { id: 2, title: "B", url: "https://example.com", favIconUrl: "", windowId: 1 },
    { id: 3, title: "C", url: "https://gitlab.com/g/p/-/issues/7", favIconUrl: "", windowId: 1 },
  ];

  it("passes only the requested tabs to detection and reports the counts", async () => {
    const detectForgeLabels = vi.fn(async (list: TabInfo[]) =>
      list.map((entry) => ({
        tabId: entry.id ?? -1,
        url: entry.url,
        label: "x",
        platform: "github" as const,
        applied: true,
      })),
    );
    const handle = createBridgeCommandHandler(workspace(tabs), {
      ...services(),
      detectForgeLabels,
    });

    const result = (await handle({ type: "detectForgeTabs", tabIds: [1, 2], dryRun: false })) as {
      scanned: number;
      found: number;
      applied: number;
    };

    expect(detectForgeLabels.mock.calls[0]?.[0].map((entry) => entry.id)).toEqual([1, 2]);
    expect(result).toMatchObject({ scanned: 2, found: 2, applied: 2, dryRun: false });
  });

  it("forwards dryRun so nothing is renamed", async () => {
    const detectForgeLabels = vi.fn(async () => []);
    const handle = createBridgeCommandHandler(workspace(tabs), {
      ...services(),
      detectForgeLabels,
    });

    await handle({ type: "detectForgeTabs", dryRun: true, tabIds: undefined });

    expect(detectForgeLabels).toHaveBeenCalledWith(expect.any(Array), { dryRun: true });
  });
});

describe("bridge todo commands", () => {
  const tabs: TabInfo[] = [
    { id: 1, title: "Docs", url: "https://example.com/docs", favIconUrl: "", windowId: 1 },
    {
      id: 2,
      title: "Mail",
      customLabel: "Inbox",
      url: "https://mail.example/",
      favIconUrl: "",
      windowId: 1,
      workspaceId: "work",
      workspaceName: "Work",
    },
    { id: 3, title: "Notes", url: "https://notes.example/", favIconUrl: "", windowId: 1 },
  ];

  it("lists todos in tab order with the tab's title and location", async () => {
    const marked: TabTodo[] = [
      { tabId: 2, status: "todo" },
      { tabId: 1, status: "todo" },
    ];
    const handle = createBridgeCommandHandler(
      workspace(tabs),
      services({}, { getTodos: vi.fn(async () => marked) }),
    );

    await expect(handle({ type: "listTodos" })).resolves.toEqual({
      todoCount: 2,
      todo: [
        expect.objectContaining({
          tabId: 1,
          status: "todo",
          title: "Docs",
          url: "https://example.com/docs",
        }),
        expect.objectContaining({
          tabId: 2,
          status: "todo",
          title: "Mail",
          label: "Inbox",
          spaceName: "Work",
        }),
      ],
    });
  });

  it("sets a todo status and reports whether a clear removed one", async () => {
    const store = new Map<number, TodoStatus>();
    const handle = createBridgeCommandHandler(
      workspace(tabs),
      services(
        {},
        {
          setTodo: vi.fn(async (tabId: number, status: TodoStatus | "none") => {
            if (status === "none") {
              store.delete(tabId);
            } else {
              store.set(tabId, status);
            }
          }),
          getTodos: vi.fn(async (tabIds: number[]) =>
            tabIds.flatMap((tabId) => {
              const status = store.get(tabId);
              return status ? [{ tabId, status }] : [];
            }),
          ),
        },
      ),
    );

    await expect(handle({ type: "setTodo", tabId: 1, status: "todo" })).resolves.toEqual({
      tabId: 1,
      status: "todo",
    });
    await expect(handle({ type: "clearTodo", tabId: 1 })).resolves.toEqual({
      tabId: 1,
      cleared: true,
    });
    await expect(handle({ type: "clearTodo", tabId: 1 })).resolves.toEqual({
      tabId: 1,
      cleared: false,
    });
  });

  it("fails clearly when the handler was built without todo services", async () => {
    const handle = createBridgeCommandHandler(workspace(tabs));
    await expect(handle({ type: "listTodos" })).rejects.toThrow(
      "todos are not available in this context.",
    );
  });
});
