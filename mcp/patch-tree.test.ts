import { describe, expect, it } from "vitest";
import type { BridgeCommand } from "@/shared/messaging/bridge-protocol";
import { applyPatchTree, type PatchRequest, type PatchSnapshot } from "./patch-tree";

const snapshot: PatchSnapshot = {
  spaces: [
    { id: "general", name: "General" },
    { id: "work", name: "Work" },
  ],
  folders: [
    {
      id: "docs",
      name: "Docs",
      spaceId: "work",
      spaceName: "Work",
      collapsed: false,
    },
  ],
  tabs: [
    { id: 1, title: "Mail", spaceId: "general" },
    { id: 2, title: "Issue", spaceId: "work", folderId: "docs" },
    { id: 3, title: "Chat", essential: true },
  ],
};

function recorder() {
  const commands: BridgeCommand[] = [];
  let spaces = 1;
  let folders = 1;
  let tabs = 200;
  const request: PatchRequest = async (command) => {
    commands.push(command);
    if (command.type === "createSpace") {
      return { spaceId: `space-new-${spaces++}`, name: command.name };
    }
    if (command.type === "createFolder") {
      return { folderId: `folder-new-${folders++}` };
    }
    if (command.type === "openTab") {
      return { id: tabs++, title: "New Tab", url: command.url, windowId: 1 };
    }
    return {};
  };
  return { commands, request };
}

describe("applyPatchTree", () => {
  it("lets nested children inherit space and folder, and creates instead of patching when id is omitted", async () => {
    const { commands, request } = recorder();
    const result = await applyPatchTree(
      [
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
                  children: [{ type: "tab", name: "Drive", url: "https://drive.google.com/" }],
                },
              ],
            },
          ],
        },
      ],
      { snapshot, request },
    );

    expect(result.results.map((entry) => entry.status)).toEqual([
      "created",
      "created",
      "created",
      "created",
    ]);
    expect(commands.map((command) => command.type)).toEqual([
      "createSpace",
      "createFolder",
      "createFolder",
      "openTab",
      "renameTab",
    ]);
    expect(commands[1]).toMatchObject({
      type: "createFolder",
      name: "Docs",
      spaceId: "space-new-1",
    });
    expect(commands[1]).not.toHaveProperty("parentId");
    expect(commands[2]).toMatchObject({
      type: "createFolder",
      name: "API",
      spaceId: "space-new-1",
      parentId: "folder-new-1",
    });
    expect(commands[3]).toMatchObject({
      type: "openTab",
      url: "https://drive.google.com/",
      folderId: "folder-new-2",
    });
  });

  it("patches an existing tab by id without requiring location on the node", async () => {
    const { commands, request } = recorder();
    const result = await applyPatchTree([{ type: "tab", id: 1, name: "Inbox" }], {
      snapshot,
      request,
    });
    expect(result.results[0]).toMatchObject({ status: "patched", id: 1 });
    expect(commands).toEqual([{ type: "renameTab", tabId: 1, label: "Inbox" }]);
  });

  it("clears essential before moving a tab, then sets it last when requested", async () => {
    const { commands, request } = recorder();
    await applyPatchTree([{ type: "tab", id: 3, spaceId: "work", essential: true }], {
      snapshot,
      request,
    });
    expect(commands.map((command) => command.type)).toEqual([
      "clearEssential",
      "removeTabsFromFolder",
      "moveTabsToSpace",
      "setEssential",
    ]);
    expect(commands[0]).toEqual({ type: "clearEssential", tabIds: [3] });
    expect(commands[2]).toEqual({ type: "moveTabsToSpace", tabIds: [3], spaceId: "work" });
    expect(commands.at(-1)).toEqual({ type: "setEssential", tabIds: [3] });
  });

  it("fails a new tab that has no url", async () => {
    const { commands, request } = recorder();
    const result = await applyPatchTree([{ type: "tab", name: "Broken", spaceId: "work" }], {
      snapshot,
      request,
    });
    expect(result.results[0]).toMatchObject({
      status: "failed",
      error: "New tabs need a url (http or https).",
    });
    expect(commands).toEqual([]);
  });

  it("returns the plan on dryRun without calling the bridge", async () => {
    const { commands, request } = recorder();
    const result = await applyPatchTree(
      [
        {
          type: "space",
          name: "Client",
          children: [{ type: "folder", name: "Docs", children: [{ type: "tab", name: "Drive" }] }],
        },
      ],
      { dryRun: true, snapshot, request },
    );
    expect(result.dryRun).toBe(true);
    expect(commands).toEqual([]);
    expect(result.results.map((entry) => entry.status)).toEqual(["created", "created", "failed"]);
    expect(result.results[2]?.error).toMatch(/url/);
  });
});
