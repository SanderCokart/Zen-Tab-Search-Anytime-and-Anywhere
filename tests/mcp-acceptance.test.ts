// @vitest-environment node
/**
 * End-to-end acceptance test for the MCP tools: a real MCP client calls the
 * real tools, which talk through the real bridge server and WebSocket to the
 * real extension bridge client and command handler. Only Zen itself is faked,
 * by an in-memory workspace.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridgeClient } from "@/features/bridge/background/bridge-client";
import {
  createBridgeCommandHandler,
  type BridgeWorkspace,
} from "@/features/bridge/background/zen-commands";
import type { TabInfo } from "@/shared/types";
import { ZenBridge } from "@/mcp/bridge-server";
import { registerZenTools } from "@/mcp/tools";

interface FakeTab {
  id: number;
  url: string;
  title: string;
  spaceId?: string;
  folderId?: string;
  essential?: boolean;
  pinned?: boolean;
  pinnedUrl?: string;
}

/** An in-memory Zen with two spaces. New tabs stay at about:blank, like a tab that has not loaded yet. */
function createFakeZen() {
  const spaces = [
    { id: "general", name: "General", isActive: true },
    { id: "work", name: "Work", isActive: false },
  ];
  const folders: { id: string; name: string; spaceId: string; parentId?: string }[] = [];
  const tabs: FakeTab[] = [
    { id: 1, url: "https://news.example/", title: "News", spaceId: "general" },
    { id: 2, url: "https://docs.google.com/document/", title: "Docs", spaceId: "work" },
    { id: 3, url: "https://mail.example/", title: "Mail", essential: true, pinned: true },
    { id: 4, url: "https://wiki.example/", title: "Wiki", spaceId: "work" },
  ];
  let nextTabId = 100;
  let nextFolderId = 1;

  const spaceName = (id?: string) => spaces.find((space) => space.id === id)?.name ?? "";
  const folderPath = (folderId?: string) => {
    const path: { id: string; name: string }[] = [];
    let current = folders.find((entry) => entry.id === folderId);
    while (current) {
      path.unshift({ id: current.id, name: current.name });
      current = current.parentId
        ? folders.find((entry) => entry.id === current?.parentId)
        : undefined;
    }
    return path;
  };
  const toInfo = (tab: FakeTab): TabInfo => {
    const path = folderPath(tab.folderId);
    const folder = path[path.length - 1];
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favIconUrl: "data:image/png;base64,AAAA",
      windowId: 1,
      ...(tab.spaceId ? { workspaceId: tab.spaceId, workspaceName: spaceName(tab.spaceId) } : {}),
      ...(folder
        ? {
            folderId: folder.id,
            folderName: folder.name,
            folderPath: path,
          }
        : {}),
      ...(tab.essential ? { essential: true } : {}),
      ...(tab.pinned || tab.essential ? { pinned: true } : {}),
    };
  };
  const findTab = (id: number) => {
    const tab = tabs.find((entry) => entry.id === id);
    if (!tab) {
      throw new Error(`Tab not found: ${id}`);
    }
    return tab;
  };

  const workspace: BridgeWorkspace = {
    listTabs: async () => tabs.map(toInfo),
    listSelectedTabs: async () => [],
    listSpaces: async () => spaces,
    listFolders: async () =>
      folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        spaceId: folder.spaceId,
        spaceName: spaceName(folder.spaceId),
        ...(folder.parentId ? { parentId: folder.parentId } : {}),
        collapsed: false,
      })),
    activateTab: async () => undefined,
    switchSpace: async () => undefined,
    setLabel: async () => true,
    createFolder: async (name, spaceId, _tabIds, parentId) => {
      const id = `folder-${nextFolderId++}`;
      folders.push({
        id,
        name,
        spaceId: spaceId ?? "general",
        ...(parentId ? { parentId } : {}),
      });
      return id;
    },
    createSpace: async (name) => {
      const id = `space-${spaces.length + 1}`;
      spaces.push({ id, name, isActive: false });
      return id;
    },
    renameSpace: async (spaceId, name) => {
      const space = spaces.find((entry) => entry.id === spaceId);
      if (space) {
        space.name = name;
      }
    },
    moveFolder: async (folderId, placement) => {
      const folder = folders.find((entry) => entry.id === folderId);
      if (!folder) {
        throw new Error(`Zen folder not found: ${folderId}`);
      }
      if (placement.spaceId) {
        folder.spaceId = placement.spaceId;
      }
      folder.parentId = placement.parentId;
    },
    deleteFolders: async (folderIds) => {
      for (const folderId of folderIds) {
        const folder = folders.find((entry) => entry.id === folderId);
        if (!folder) {
          throw new Error(`Zen folder not found: ${folderId}`);
        }
        if (
          tabs.some((tab) => tab.folderId === folderId) ||
          folders.some((entry) => entry.parentId === folderId)
        ) {
          throw new Error(
            `Folder "${folder.name}" is not empty. Move its tabs and subfolders out first.`,
          );
        }
        folders.splice(folders.indexOf(folder), 1);
      }
    },
    deleteSpaces: async (spaceIds) => {
      if (spaces.length - spaceIds.length < 1) {
        throw new Error("Cannot delete every space. Leave at least one.");
      }
      for (const spaceId of spaceIds) {
        const space = spaces.find((entry) => entry.id === spaceId);
        if (!space) {
          throw new Error(`Space not found: ${spaceId}`);
        }
        for (const tab of [...tabs]) {
          if (tab.spaceId === spaceId && !tab.essential) {
            tabs.splice(tabs.indexOf(tab), 1);
          }
        }
        for (const folder of [...folders]) {
          if (folder.spaceId === spaceId) {
            folders.splice(folders.indexOf(folder), 1);
          }
        }
        spaces.splice(spaces.indexOf(space), 1);
      }
    },
    setEssential: async (tabIds) => {
      for (const id of tabIds) {
        Object.assign(findTab(id), { essential: true, folderId: undefined, spaceId: undefined });
      }
    },
    clearEssential: async (tabIds) => {
      for (const id of tabIds) {
        Object.assign(findTab(id), { essential: false, spaceId: "general" });
      }
    },
    setPinned: async (tabIds, pinned) => {
      for (const id of tabIds) {
        Object.assign(findTab(id), { pinned });
      }
      return tabIds.length;
    },
    renameFolder: async () => undefined,
    moveTabsToFolder: async (tabIds, folderId) => {
      const folder = folders.find((entry) => entry.id === folderId);
      if (!folder) {
        throw new Error(`Zen folder not found: ${folderId}`);
      }
      for (const id of tabIds) {
        Object.assign(findTab(id), { folderId, spaceId: folder.spaceId, pinned: true });
      }
      return tabIds.length;
    },
    removeTabsFromFolder: async () => 0,
    moveTabsToSpace: async (tabIds, spaceId) => {
      for (const id of tabIds) {
        findTab(id).spaceId = spaceId;
      }
      return tabIds.length;
    },
    moveTab: async () => undefined,
    openTab: async (url, { pinned }) => {
      const id = nextTabId++;
      tabs.push({
        id,
        url: "about:blank",
        title: "New Tab",
        spaceId: "general",
        pinned,
        pinnedUrl: url,
      });
      return id;
    },
    closeTab: async (id) => {
      tabs.splice(tabs.indexOf(findTab(id)), 1);
    },
    closeTabs: async (tabIds) => {
      for (const id of tabIds) {
        tabs.splice(tabs.indexOf(findTab(id)), 1);
      }
    },
    getTab: async (id) => toInfo(findTab(id)),
    getPinnedUrl: async (id) => {
      const tab = findTab(id);
      return tab.pinnedUrl ?? tab.url;
    },
    setPinnedUrl: async (id, url) => {
      const tab = findTab(id);
      if (!tab.pinned && !tab.essential) {
        throw new Error("Tab is not pinned.");
      }
      tab.pinnedUrl = url;
    },
    replacePinnedUrlWithCurrent: async (id) => {
      const tab = findTab(id);
      if (!tab.pinned && !tab.essential) {
        throw new Error("Tab is not pinned.");
      }
    },
  };

  return { workspace, tabs, folders, spaces };
}

const TOKEN = "acceptance-token";
let bridge: ZenBridge;
let client: Client;
let extension: { stop(): void } | undefined;
let zen: ReturnType<typeof createFakeZen>;
const sockets: WebSocket[] = [];

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  if (result.isError) {
    throw new Error(text);
  }
  return JSON.parse(text);
}

beforeEach(async () => {
  zen = createFakeZen();
  bridge = new ZenBridge({ token: TOKEN, port: 0, version: "test" });
  await bridge.start();

  extension = startBridgeClient({
    handle: createBridgeCommandHandler(zen.workspace),
    url: `ws://127.0.0.1:${bridge.port}`,
    readToken: async () => TOKEN,
    createSocket: (url) => {
      const socket = new WebSocket(url, { origin: "moz-extension://acceptance" });
      sockets.push(socket);
      return socket as unknown as globalThis.WebSocket;
    },
  });
  await vi.waitFor(() => expect(bridge.connected).toBe(true));

  const server = new McpServer({ name: "zen-deck", version: "test" });
  registerZenTools(server, bridge);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "acceptance", version: "1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  extension?.stop();
  await client.close();
  bridge.close();
  for (const socket of sockets.splice(0)) {
    socket.terminate();
  }
  extension = undefined;
});

const MCP_TOOLS = [
  "zen_activate_tab",
  "zen_apply_patch",
  "zen_close_tab",
  "zen_delete_folder",
  "zen_delete_space",
  "zen_detect_forge_tabs",
  "zen_get_pinned_url",
  "zen_list_folders",
  "zen_list_tabs",
  "zen_list_timers",
  "zen_list_todos",
  "zen_move_tab",
  "zen_set_color",
  "zen_set_pinned_url",
  "zen_set_timer",
  "zen_set_todo",
  "zen_status",
] as const;

describe("MCP acceptance", () => {
  it("registers a small tool list", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...MCP_TOOLS]);
  });

  it("lists tab counts without returning individual tabs", async () => {
    const counts = await call("zen_list_tabs", { fields: "counts" });
    expect(counts).toEqual({
      totalTabs: 4,
      essentialTabs: 1,
      tabsBySpace: [
        { spaceId: "general", spaceName: "General", active: true, tabCount: 1, folders: [] },
        { spaceId: "work", spaceName: "Work", tabCount: 2, folders: [] },
      ],
    });
    expect(counts).not.toHaveProperty("tabs");
    expect(counts).not.toHaveProperty("spaces");
  });

  it("retrieves all tabs in one request", async () => {
    const all = await call("zen_list_tabs", { groupBy: "none", fields: "titles" });
    expect(all).not.toHaveProperty("page");
    expect(all.tabs.map((tab: { id: number }) => tab.id).sort()).toEqual([1, 2, 3, 4]);
    expect(all.tabs.find((tab: { id: number }) => tab.id === 3)).toMatchObject({ global: true });
  });

  it("opens a tab into a folder through zen_apply_patch", async () => {
    const patched = await call("zen_apply_patch", {
      nodes: [
        {
          type: "space",
          id: "work",
          children: [
            {
              type: "folder",
              name: "Reading",
              children: [{ type: "tab", name: "Article", url: "https://example.com/article" }],
            },
          ],
        },
      ],
    });
    expect(patched.results.map((entry: { status: string }) => entry.status)).toEqual([
      "patched",
      "created",
      "created",
    ]);
    const tabId = patched.results[2].id as number;
    const folderId = patched.results[1].id as string;
    expect(zen.tabs.find((tab) => tab.id === tabId)).toMatchObject({
      pinned: true,
      spaceId: "work",
      folderId,
    });
  });

  it("refuses non-web URLs without opening anything", async () => {
    const before = zen.tabs.length;
    await expect(
      call("zen_apply_patch", {
        nodes: [{ type: "tab", name: "Bad", url: "javascript:alert(1)", spaceId: "general" }],
      }),
    ).rejects.toThrow(/http and https/);
    expect(zen.tabs).toHaveLength(before);
  });

  it("reports status with an actionable problem once Zen disconnects", async () => {
    expect(await call("zen_status")).toMatchObject({
      connected: true,
      bridge: "listening",
      version: "test",
    });
    for (const socket of sockets.splice(0)) {
      socket.terminate();
    }
    await vi.waitFor(() => expect(bridge.connected).toBe(false));
    const status = await call("zen_status");
    expect(status.connected).toBe(false);
    expect(status.problem).toMatch(/Zen disconnected at .* reconnects within a minute/);
  });

  it("creates a nested layout with zen_apply_patch, then closes and deletes", async () => {
    const patched = await call("zen_apply_patch", {
      nodes: [
        {
          type: "space",
          name: "Client",
          children: [
            {
              type: "folder",
              name: "Docs",
              children: [
                {
                  type: "folder",
                  name: "API",
                  children: [{ type: "tab", name: "Spec", url: "https://example.com/spec" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(patched.results.map((entry: { status: string }) => entry.status)).toEqual([
      "created",
      "created",
      "created",
      "created",
    ]);
    const spaceId = patched.results[0].id as string;
    const nestedId = patched.results[2].id as string;
    const tabId = patched.results[3].id as number;
    const listed = await call("zen_list_folders");
    expect(listed.find((entry: { id: string }) => entry.id === nestedId)).toMatchObject({
      path: "Client / Docs / API",
    });
    expect(zen.tabs.find((tab) => tab.id === tabId)).toMatchObject({
      spaceId,
      folderId: nestedId,
    });

    await call("zen_apply_patch", {
      nodes: [{ type: "tab", id: tabId, essential: true }],
    });
    await call("zen_apply_patch", {
      nodes: [{ type: "tab", id: tabId, essential: false }],
    });
    await call("zen_close_tab", { tabIds: [tabId] });
    await expect(call("zen_delete_folder", { folderIds: [nestedId] })).resolves.toMatchObject({
      deleted: 1,
    });
    expect(zen.folders.find((folder) => folder.id === nestedId)).toBeUndefined();

    await expect(call("zen_delete_space", { spaceIds: [spaceId] })).resolves.toMatchObject({
      deleted: 1,
      spaceIds: [spaceId],
    });
    expect(zen.spaces.find((entry) => entry.id === spaceId)).toBeUndefined();
  });

  it("reads and sets the stored URL of a pinned tab", async () => {
    const patched = await call("zen_apply_patch", {
      nodes: [
        {
          type: "space",
          id: "work",
          children: [
            {
              type: "folder",
              name: "Mail",
              children: [{ type: "tab", name: "Mail", url: "https://mail.example/" }],
            },
          ],
        },
      ],
    });
    const tabId = patched.results[2].id as number;
    await expect(call("zen_get_pinned_url", { tabId })).resolves.toMatchObject({
      tabId,
      url: "https://mail.example/",
    });
    await expect(
      call("zen_set_pinned_url", { tabId, url: "https://mail.example/starred" }),
    ).resolves.toEqual({ tabId, url: "https://mail.example/starred" });
    expect(zen.tabs.find((tab) => tab.id === tabId)?.pinnedUrl).toBe(
      "https://mail.example/starred",
    );
  });
});
