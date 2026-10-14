import { describe, expect, it, vi } from "vitest";
import {
  createBridgeCommandHandler,
  type BridgeServices,
  type BridgeWorkspace,
} from "@/features/bridge/background/zen-commands";
import type {
  TabInfo,
  TabStatus,
  TabTimer,
  TabTodo,
  TodoStatus,
  TrafficLight,
} from "@/shared/types";

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
    closeTabs: async () => undefined,
    createSpace: async () => "space-1",
    renameSpace: async () => undefined,
    moveFolder: async () => undefined,
    deleteFolders: async () => undefined,
    deleteSpaces: async () => undefined,
    setEssential: async () => undefined,
    clearEssential: async () => undefined,
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
  statuses: Partial<BridgeServices["statuses"]> = {},
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
    statuses: {
      setStatus: vi.fn(async () => undefined),
      getStatuses: vi.fn(async () => []),
      ...statuses,
    },
    detectForgeLabels: vi.fn(async () => []),
  };
}

describe("bridge timer commands", () => {
  it("sets a timer from the same text the timer popup accepts", async () => {
    const svc = services();
    const handle = createBridgeCommandHandler(workspace(), svc);
    const before = Date.now();

    const result = (await handle({ type: "setTimer", tabIds: [9], when: "30m" })) as {
      endAt: number;
      endsAt: string;
      timers: { tabId: number }[];
    };

    expect(result.timers.map((entry) => entry.tabId)).toEqual([9]);
    const endAt = vi.mocked(svc.timers.setTabTimer).mock.calls[0]?.[1] ?? 0;
    expect(endAt - before).toBeGreaterThan(29 * 60_000);
    expect(endAt - before).toBeLessThan(31 * 60_000);
    expect(result.endsAt).toBe(new Date(result.endAt).toISOString());
  });

  it("sets the same timer on several tabs", async () => {
    const svc = services();
    const handle = createBridgeCommandHandler(workspace(), svc);
    const result = (await handle({ type: "setTimer", tabIds: [9, 10], when: "30m" })) as {
      timers: { tabId: number }[];
    };
    expect(svc.timers.setTabTimer).toHaveBeenCalledTimes(2);
    expect(result.timers.map((entry) => entry.tabId)).toEqual([9, 10]);
    const firstEnd = vi.mocked(svc.timers.setTabTimer).mock.calls[0]?.[1];
    const secondEnd = vi.mocked(svc.timers.setTabTimer).mock.calls[1]?.[1];
    expect(firstEnd).toBe(secondEnd);
  });

  it("rejects text it cannot read as a time, without touching the timer service", async () => {
    const svc = services();
    const handle = createBridgeCommandHandler(workspace(), svc);

    await expect(handle({ type: "setTimer", tabIds: [9], when: "whenever" })).rejects.toThrow(
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

    await expect(handle({ type: "clearTimer", tabIds: [4] })).resolves.toEqual({
      tabIds: [4],
      cleared: 1,
      tabs: [{ tabId: 4, cleared: true }],
    });
  });

  it("reports a clear of a tab without a timer as cleared: false", async () => {
    const svc = services({ clearTabTimer: async () => false });
    const handle = createBridgeCommandHandler(workspace(), svc);
    await expect(handle({ type: "clearTimer", tabIds: [4] })).resolves.toEqual({
      tabIds: [4],
      cleared: 0,
      tabs: [{ tabId: 4, cleared: false }],
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

    await expect(handle({ type: "setTodo", tabIds: [1, 2], status: "todo" })).resolves.toEqual({
      tabIds: [1, 2],
      status: "todo",
    });
    await expect(handle({ type: "clearTodo", tabIds: [1] })).resolves.toEqual({
      tabIds: [1],
      cleared: 1,
    });
    await expect(handle({ type: "clearTodo", tabIds: [1] })).resolves.toEqual({
      tabIds: [1],
      cleared: 0,
    });
  });

  it("fails clearly when the handler was built without todo services", async () => {
    const handle = createBridgeCommandHandler(workspace(tabs));
    await expect(handle({ type: "listTodos" })).rejects.toThrow(
      "todos are not available in this context.",
    );
  });
});

describe("bridge status color commands", () => {
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

  it("lists status colors in tab order with the tab's title and location", async () => {
    const marked: TabStatus[] = [
      { tabId: 2, light: "orange" },
      { tabId: 1, light: "red" },
    ];
    const handle = createBridgeCommandHandler(
      workspace(tabs),
      services({}, {}, { getStatuses: vi.fn(async () => marked) }),
    );

    await expect(handle({ type: "listStatuses" })).resolves.toEqual({
      statusCount: 2,
      statuses: [
        expect.objectContaining({
          tabId: 1,
          color: "red",
          title: "Docs",
          url: "https://example.com/docs",
        }),
        expect.objectContaining({
          tabId: 2,
          color: "orange",
          title: "Mail",
          label: "Inbox",
          spaceName: "Work",
        }),
      ],
    });
  });

  it("includes colors on listed tabs", async () => {
    const handle = createBridgeCommandHandler(
      workspace(tabs),
      services({}, {}, { getStatuses: vi.fn(async () => [{ tabId: 1, light: "red" as const }]) }),
    );

    const listed = (await handle({ type: "listTabs" })) as { id: number; color?: string }[];
    expect(listed.find((tab) => tab.id === 1)).toMatchObject({ color: "red" });
    expect(listed.find((tab) => tab.id === 2)).not.toHaveProperty("color");
  });

  it("sets a status color and reports whether a clear removed one", async () => {
    const store = new Map<number, TrafficLight>();
    const handle = createBridgeCommandHandler(
      workspace(tabs),
      services(
        {},
        {},
        {
          setStatus: vi.fn(async (tabId: number, light: TrafficLight | "none") => {
            if (light === "none") {
              store.delete(tabId);
            } else {
              store.set(tabId, light);
            }
          }),
          getStatuses: vi.fn(async (tabIds: number[]) =>
            tabIds.flatMap((tabId) => {
              const light = store.get(tabId);
              return light ? [{ tabId, light }] : [];
            }),
          ),
        },
      ),
    );

    await expect(handle({ type: "setStatus", tabIds: [1, 2], light: "green" })).resolves.toEqual({
      tabIds: [1, 2],
      color: "green",
    });
    await expect(handle({ type: "clearStatus", tabIds: [1] })).resolves.toEqual({
      tabIds: [1],
      cleared: 1,
    });
    await expect(handle({ type: "clearStatus", tabIds: [1] })).resolves.toEqual({
      tabIds: [1],
      cleared: 0,
    });
  });

  it("fails clearly when the handler was built without status services", async () => {
    const handle = createBridgeCommandHandler(workspace(tabs));
    await expect(handle({ type: "setStatus", tabIds: [1], light: "red" })).rejects.toThrow(
      "status colors are not available in this context.",
    );
  });
});
