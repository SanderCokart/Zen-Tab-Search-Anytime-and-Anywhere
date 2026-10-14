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
    openTab: async (_url, { pinned }) => {
      const id = nextTabId++;
      tabs.push({ id, url: "about:blank", title: "New Tab", spaceId: "general", pinned });
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

  const server = new McpServer({ name: "zen-tab-search", version: "test" });
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

describe("MCP acceptance", () => {
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

  it("creates a Google folder in General, opens Drive, Docs and Sheets into it, and does it again without duplicates", async () => {
    const spaces = await call("zen_list_spaces");
    const general = spaces.find((space: { name: string }) => space.name === "General");

    const folder = await call("zen_create_folder", { name: "Google", spaceId: general.id });
    expect(folder).toMatchObject({
      created: true,
      name: "Google",
      spaceId: "general",
      path: "General / Google",
    });
    const again = await call("zen_create_folder", { name: "google ", spaceId: general.id });
    expect(again).toMatchObject({
      created: false,
      reused: true,
      folderId: folder.folderId,
      path: "General / Google",
    });
    expect(again.note).toMatch(/Reused existing folder "Google"/);
    expect(zen.folders).toHaveLength(1);

    const services = ["drive", "docs", "sheets"];
    const first = await call("zen_open_google_workspace", { services, folderId: folder.folderId });
    expect(first).toMatchObject({ created: 3, existing: 0, failed: 0 });
    expect(first.target).toEqual({
      spaceId: "general",
      spaceName: "General",
      folderId: folder.folderId,
      folderName: "Google",
    });
    for (const result of first.results) {
      expect(result).toMatchObject({
        status: "created",
        spaceId: "general",
        folderId: folder.folderId,
        folderName: "Google",
      });
      expect(typeof result.tabId).toBe("number");
    }
    // Docs is already open in the Work space, but that does not count for the Google folder.
    expect(first.results.map((result: { url: string }) => result.url)).toEqual([
      "https://drive.google.com/",
      "https://docs.google.com/document/",
      "https://docs.google.com/spreadsheets/",
    ]);

    const tabCount = zen.tabs.length;
    const second = await call("zen_open_google_workspace", { services, folderId: folder.folderId });
    expect(second).toMatchObject({ created: 0, existing: 3, failed: 0 });
    expect(second.results.map((result: { tabId: number }) => result.tabId)).toEqual(
      first.results.map((result: { tabId: number }) => result.tabId),
    );
    expect(zen.tabs).toHaveLength(tabCount);

    const inFolder = await call("zen_list_tabs", {
      folderId: folder.folderId,
      groupBy: "folder",
      fields: "full",
    });
    expect(inFolder.totalTabs).toBe(3);
    expect(inFolder.spaces[0].folders[0]).toMatchObject({
      folderId: folder.folderId,
      folderName: "Google",
    });
    expect(inFolder.spaces[0].folders[0].tabs.map((tab: { id: number }) => tab.id).sort()).toEqual(
      first.results.map((result: { tabId: number }) => result.tabId).sort(),
    );
  });

  it("opens a single tab into a folder and reports where it went", async () => {
    const { folderId } = await call("zen_create_folder", { name: "Reading", spaceId: "work" });
    const opened = await call("zen_open_tab", { url: "https://example.com/article", folderId });
    expect(opened).toMatchObject({
      created: true,
      url: "https://example.com/article",
      spaceId: "work",
      spaceName: "Work",
      folderId,
      folderName: "Reading",
    });
    expect(zen.tabs.find((tab) => tab.id === opened.tabId)).toMatchObject({ pinned: true });
  });

  it("refuses non-web URLs and a folder from another space without opening anything", async () => {
    const before = zen.tabs.length;
    await expect(call("zen_open_tab", { url: "javascript:alert(1)" })).rejects.toThrow(
      /http and https/,
    );
    const { folderId } = await call("zen_create_folder", { name: "Reading", spaceId: "work" });
    await expect(
      call("zen_open_tab", { url: "https://example.com", folderId, spaceId: "general" }),
    ).rejects.toThrow('Folder "Reading" is in space "Work"');
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

  it("creates a nested folder, applies a patch tree, then closes a tab and deletes the empty folder", async () => {
    const space = await call("zen_create_space", { name: "Client" });
    expect(space).toMatchObject({ created: true, name: "Client" });
    const again = await call("zen_create_space", { name: "client " });
    expect(again).toMatchObject({ created: false, reused: true, spaceId: space.spaceId });

    const parent = await call("zen_create_folder", { name: "Docs", spaceId: space.spaceId });
    const nested = await call("zen_create_folder", {
      name: "API",
      parentPath: "Client / Docs",
    });
    expect(nested).toMatchObject({
      created: true,
      name: "API",
      spaceId: space.spaceId,
      parentId: parent.folderId,
      path: "Client / Docs / API",
    });
    const reused = await call("zen_create_folder", { name: "api", parentPath: "Client / Docs" });
    expect(reused).toMatchObject({ created: false, reused: true, folderId: nested.folderId });
    const listed = await call("zen_list_folders");
    expect(listed.find((entry: { id: string }) => entry.id === nested.folderId)).toMatchObject({
      path: "Client / Docs / API",
    });

    const patched = await call("zen_apply_patch", {
      nodes: [
        {
          type: "space",
          id: space.spaceId,
          children: [
            {
              type: "folder",
              id: parent.folderId,
              children: [
                {
                  type: "folder",
                  id: nested.folderId,
                  children: [{ type: "tab", name: "Spec", url: "https://example.com/spec" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(patched.results.map((entry: { status: string }) => entry.status)).toEqual([
      "patched",
      "patched",
      "patched",
      "created",
    ]);
    const tabId = patched.results[3].id as number;
    expect(zen.tabs.find((tab) => tab.id === tabId)).toMatchObject({
      spaceId: space.spaceId,
      folderId: nested.folderId,
    });

    await call("zen_set_essential", { tabIds: [tabId] });
    await call("zen_clear_essential", { tabIds: [tabId] });
    await call("zen_close_tab", { tabIds: [tabId] });
    await expect(
      call("zen_delete_folder", { folderIds: [nested.folderId] }),
    ).resolves.toMatchObject({
      deleted: 1,
    });
    expect(zen.folders.find((folder) => folder.id === nested.folderId)).toBeUndefined();

    await expect(call("zen_delete_space", { spaceIds: [space.spaceId] })).resolves.toMatchObject({
      deleted: 1,
      spaceIds: [space.spaceId],
    });
    expect(zen.spaces.find((entry) => entry.id === space.spaceId)).toBeUndefined();
  });
});
