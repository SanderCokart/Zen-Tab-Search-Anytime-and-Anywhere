import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as v from "valibot";
import {
  tabSummarySchema,
  zenFolderInfoSchema,
  type BridgeCommand,
  type TabSummary,
} from "@/shared/messaging/bridge-protocol";
import { spaceInfoSchema, TRAFFIC_LIGHTS, type SpaceInfo } from "@/shared/messaging/protocol";
import type { ZenBridge } from "./bridge-server";
import { findReusableFolder } from "./folders";
import { applyPatchTree, type PatchTreeNode } from "./patch-tree";
import { findReusableSpace } from "./spaces";
import {
  findServiceTab,
  GOOGLE_SERVICE_DEFINITIONS,
  GOOGLE_SERVICES,
  type GoogleService,
} from "./google-workspace";
import { buildTabListView, TAB_FIELDS, TAB_GROUPINGS } from "./tab-view";

const tabId = z.number().int().min(0).describe("Tab ID from zen_list_tabs");
const tabIds = z.array(tabId).min(1).max(200).describe("Tab IDs from zen_list_tabs");
const spaceId = z.string().min(1).describe("Space ID from zen_list_spaces");
const spaceIds = z.array(spaceId).min(1).max(200).describe("Space IDs from zen_list_spaces");
const folderId = z.string().min(1).describe("Folder ID from zen_list_folders or zen_list_tabs");
const folderIds = z.array(folderId).min(1).max(200).describe("Folder IDs from zen_list_folders");
const folderName = z.string().trim().min(1).max(120).describe("Folder name");
const spaceName = z.string().trim().min(1).max(120).describe("Space name");
const webUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((url) => /^https?:\/\//i.test(url), "Only http and https URLs can be opened.")
  .describe("http or https URL to open");

const tabPatch = z.object({
  type: z.literal("tab"),
  id: tabId.optional().describe("Existing tab to patch; omit to create"),
  name: z.string().trim().max(200).optional().describe("Set or overwrite the tab name"),
  url: webUrl.optional().describe("Required when creating a tab"),
  spaceId: spaceId.optional().describe("Explicit space; nested children inherit this"),
  folderId: folderId.optional().describe("Explicit parent folder; nested children inherit this"),
  essential: z.boolean().optional().describe("Mark or unmark the tab as essential after moving"),
});

const folderPatch: z.ZodType<Extract<PatchTreeNode, { type: "folder" }>> = z.lazy(() =>
  z.object({
    type: z.literal("folder"),
    id: folderId.optional().describe("Existing folder to patch; omit to create"),
    name: folderName.optional().describe("Set or overwrite the folder name"),
    spaceId: spaceId.optional(),
    folderId: folderId.optional().describe("Parent folder; omit at a space root"),
    children: z.array(z.union([tabPatch, folderPatch])).optional(),
  }),
);

const spacePatch = z.object({
  type: z.literal("space"),
  id: spaceId.optional().describe("Existing space to patch; omit to create"),
  name: spaceName.optional().describe("Set or overwrite the space name"),
  children: z.array(z.union([tabPatch, folderPatch])).optional(),
});

const patchTreeNode = z.union([spacePatch, tabPatch, folderPatch]);

const readOnly = { readOnlyHint: true };
const writes = { readOnlyHint: false, destructiveHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true };
// Opening an existing service or folder again changes nothing.
const idempotentWrites = { ...writes, idempotentHint: true };

type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function asError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Where a tab ended up, in the shape the open tools return. */
function tabLocation(tab: TabSummary) {
  return {
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
    spaceId: tab.spaceId ?? null,
    spaceName: tab.spaceName ?? null,
    folderId: tab.folderId ?? null,
    folderName: tab.folderName ?? null,
  };
}

/**
 * Registers one MCP tool per Zen operation. Each tool validates its input
 * with zod for the agent, then forwards bridge commands; the extension
 * validates them again with valibot before touching Zen.
 */
export function registerZenTools(server: McpServer, bridge: ZenBridge): void {
  /** A tool that runs several bridge commands and returns `run`'s result as JSON. */
  const workflow = <Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    input: z.ZodObject<Shape>,
    annotations: Annotations,
    run: (args: z.output<z.ZodObject<Shape>>) => Promise<unknown>,
  ) => {
    // The SDK's callback type is conditional on the shape, which TypeScript
    // cannot resolve inside this generic helper; the concrete shape keeps it sound.
    server.registerTool(
      name,
      { description, inputSchema: input.shape as z.ZodRawShape, annotations },
      async (raw: unknown) => {
        try {
          return asText(await run(input.parse(raw)));
        } catch (error) {
          return asError(error);
        }
      },
    );
  };

  /** A tool that forwards exactly one bridge command. */
  const tool = <Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: Shape,
    annotations: Annotations,
    toCommand: (args: z.output<z.ZodObject<Shape>>) => BridgeCommand,
  ) =>
    workflow(name, description, z.object(shape), annotations, (args) =>
      bridge.request(toCommand(args)),
    );

  const fetchSpaces = async () =>
    v.parse(v.array(spaceInfoSchema), await bridge.request({ type: "listSpaces" }));
  const fetchFolders = async () =>
    v.parse(v.array(zenFolderInfoSchema), await bridge.request({ type: "listFolders" }));
  const fetchTabs = async (filter: { spaceId?: string; folderId?: string }) =>
    v.parse(v.array(tabSummarySchema), await bridge.request({ type: "listTabs", ...filter }));
  const openTab = async (command: Omit<Extract<BridgeCommand, { type: "openTab" }>, "type">) =>
    v.parse(tabSummarySchema, await bridge.request({ type: "openTab", ...command }));

  function pickSpace(spaces: SpaceInfo[], requested?: string): SpaceInfo {
    const space = requested
      ? spaces.find((entry) => entry.id === requested)
      : spaces.find((entry) => entry.isActive);
    if (!space) {
      throw new Error(
        requested
          ? `Space not found: ${requested}. Get space IDs from zen_list_spaces.`
          : "Zen reported no active space. Pass spaceId explicitly.",
      );
    }
    return space;
  }

  server.registerTool(
    "zen_status",
    {
      description:
        "Check whether Zen is connected, and if not, why: Zen not connected yet, wrong token, version mismatch, or the port held by another MCP client's server (with its process ID). Call this first if other zen_ tools fail.",
      annotations: readOnly,
    },
    async () => asText(bridge.status()),
  );

  tool(
    "zen_list_spaces",
    "List Zen spaces (workspaces) with their IDs and which one is active.",
    {},
    readOnly,
    () => ({ type: "listSpaces" }),
  );

  workflow(
    "zen_list_tabs",
    'List open tabs across Zen spaces. Every result starts with totals: totalTabs, essentialTabs and tabsBySpace (tab counts per space and per folder). Tabs come grouped by space by default, 100 per page; follow page.nextOffset for more, or pass limit: 500 to get a typical session in one call. Essential tabs are shared by all spaces, so they are marked global and listed under essentials. A tab with a traffic-light color includes `color` (`red`, `orange` or `green`). Filter with spaceId or folderId (a folder includes its subfolders). Examples: { "fields": "counts" } for totals only; { "groupBy": "none", "fields": "titles", "limit": 500 } for every tab at once.',
    z.object({
      spaceId: spaceId.optional(),
      folderId: folderId.optional(),
      fields: z
        .enum(TAB_FIELDS)
        .default("titles_urls")
        .describe(
          'Detail per tab: "counts" (no tabs, only totals per space and folder; a cheap first call), "titles", "titles_urls", or "full" (IDs, original title, folder path, window)',
        ),
      groupBy: z
        .enum(TAB_GROUPINGS)
        .default("space")
        .describe('"space" (default), "folder" (space, then folder), or "none" for a flat list'),
      limit: z.number().int().min(1).max(500).default(100).describe("Tabs per page (max 500)"),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Tabs to skip; pass the previous page's nextOffset"),
    }),
    readOnly,
    async (input) => {
      const [tabs, spaces] = await Promise.all([
        fetchTabs({ spaceId: input.spaceId, folderId: input.folderId }),
        fetchSpaces(),
      ]);
      return buildTabListView(tabs, spaces, {
        fields: input.fields,
        groupBy: input.groupBy,
        limit: input.limit,
        offset: input.offset,
        filtered: Boolean(input.spaceId || input.folderId),
      });
    },
  );

  tool(
    "zen_list_folders",
    "List Zen folders (tab groups), including empty ones, with their space and parent folder.",
    {},
    readOnly,
    () => ({ type: "listFolders" }),
  );

  tool(
    "zen_get_selected_tabs",
    "List the tabs currently highlighted (multi-selected) in the active Zen window.",
    {},
    readOnly,
    () => ({ type: "getSelectedTabs" }),
  );

  workflow(
    "zen_open_tab",
    'Open a new tab in the background and return its tabId, title, URL, space and folder. Defaults to the active space. With folderId the tab goes straight into that folder (and its space), and Zen pins it, because folders hold pinned tabs. Example: { "url": "https://example.com", "folderId": "1712345678901-42" }.',
    z.object({
      url: webUrl,
      spaceId: spaceId
        .optional()
        .describe("Space to open the tab in; defaults to the active space"),
      folderId: folderId
        .optional()
        .describe("Folder to put the tab in; spaceId, if given, must be the folder's space"),
      activate: z.boolean().default(false).describe("Switch to the new tab (and its space)"),
      pinned: z.boolean().default(false).describe("Pin the tab; tabs in folders are always pinned"),
    }),
    writes,
    async (input) => {
      const tab = await openTab({
        url: input.url,
        spaceId: input.spaceId,
        folderId: input.folderId,
        active: input.activate,
        pinned: input.pinned,
      });
      return { created: true, ...tabLocation(tab) };
    },
  );

  workflow(
    "zen_open_google_workspace",
    `Open Google services (${GOOGLE_SERVICES.join(", ")}) in a space or folder, skipping any already open there, so repeating the call creates nothing new. Returns one result per service with status "created", "existing" or "failed", plus its tabId and folder. Example: { "services": ["drive", "docs", "sheets"], "folderId": "1712345678901-42" }.`,
    z.object({
      services: z
        .array(z.enum(GOOGLE_SERVICES))
        .min(1)
        .max(GOOGLE_SERVICES.length)
        .describe("Services to open, in order"),
      spaceId: spaceId
        .optional()
        .describe("Space to open them in; defaults to the active space, or the folder's space"),
      folderId: folderId.optional().describe("Folder to open them in"),
      activateFirst: z
        .boolean()
        .default(false)
        .describe("Switch to the first service's tab afterwards"),
    }),
    idempotentWrites,
    async (input) => {
      let target: { spaceId: string; spaceName: string; folderId?: string; folderName?: string };
      if (input.folderId) {
        const folder = (await fetchFolders()).find((entry) => entry.id === input.folderId);
        if (!folder) {
          throw new Error(
            `Folder not found: ${input.folderId}. Get folder IDs from zen_list_folders.`,
          );
        }
        if (input.spaceId && folder.spaceId !== input.spaceId) {
          throw new Error(
            `Folder "${folder.name}" is in space "${folder.spaceName}" (${folder.spaceId}), not ${input.spaceId}. Leave out spaceId or pick a folder in that space.`,
          );
        }
        target = {
          spaceId: folder.spaceId,
          spaceName: folder.spaceName,
          folderId: folder.id,
          folderName: folder.name,
        };
      } else {
        const space = pickSpace(await fetchSpaces(), input.spaceId);
        target = { spaceId: space.id, spaceName: space.name };
      }

      // Look only where the services should end up: a Docs tab in another
      // space is a different context and does not count as a duplicate.
      const openHere = await fetchTabs(
        target.folderId ? { folderId: target.folderId } : { spaceId: target.spaceId },
      );
      const services = [...new Set(input.services)] as GoogleService[];
      const results: Record<string, unknown>[] = [];

      for (const service of services) {
        const existing = findServiceTab(service, openHere);
        if (existing) {
          results.push({ service, status: "existing", ...tabLocation(existing) });
          continue;
        }
        const url = GOOGLE_SERVICE_DEFINITIONS[service].url;
        try {
          const tab = await openTab({
            url,
            ...(target.folderId ? { folderId: target.folderId } : { spaceId: target.spaceId }),
            active: false,
            pinned: false,
          });
          openHere.push(tab);
          results.push({ service, status: "created", ...tabLocation(tab) });
        } catch (error) {
          results.push({
            service,
            status: "failed",
            url,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      let activated: number | undefined;
      const first = results.find((result) => typeof result.tabId === "number");
      if (input.activateFirst && first) {
        await bridge.request({ type: "activateTab", tabId: first.tabId as number });
        activated = first.tabId as number;
      }

      const count = (status: string) => results.filter((result) => result.status === status).length;
      return {
        target,
        created: count("created"),
        existing: count("existing"),
        failed: count("failed"),
        ...(activated !== undefined ? { activatedTabId: activated } : {}),
        results,
      };
    },
  );

  tool(
    "zen_activate_tab",
    "Focus a tab. Switches to its space if needed and brings its window forward.",
    { tabId },
    writes,
    (input) => ({ type: "activateTab", tabId: input.tabId }),
  );

  tool("zen_switch_space", "Switch the active Zen space.", { spaceId }, writes, (input) => ({
    type: "switchSpace",
    spaceId: input.spaceId,
  }));

  tool(
    "zen_rename_tab",
    "Set a custom name on a tab. An empty label removes the custom name and shows the page title again.",
    {
      tabId,
      label: z.string().max(200).describe("New tab name; empty to clear"),
    },
    writes,
    (input) => ({ type: "renameTab", tabId: input.tabId, label: input.label }),
  );

  workflow(
    "zen_create_space",
    'Create a space without switching to it. If a space with the same name already exists, it is reused (created: false) unless allowDuplicate is true. Example: { "name": "Work" }.',
    z.object({
      name: spaceName,
      allowDuplicate: z
        .boolean()
        .default(false)
        .describe("Create a new space even if one with this name already exists"),
    }),
    idempotentWrites,
    async (input) => {
      const existing = input.allowDuplicate
        ? undefined
        : findReusableSpace(await fetchSpaces(), input.name);
      if (existing) {
        return { created: false, spaceId: existing.id, name: existing.name };
      }
      const result = v.parse(
        v.object({ spaceId: v.string(), name: v.string() }),
        await bridge.request({ type: "createSpace", name: input.name }),
      );
      return { created: true, spaceId: result.spaceId, name: result.name };
    },
  );

  tool(
    "zen_rename_space",
    "Rename a space.",
    { spaceId, name: spaceName },
    idempotentWrites,
    (input) => ({ type: "renameSpace", spaceId: input.spaceId, name: input.name }),
  );

  workflow(
    "zen_create_folder",
    'Create a folder in a space, or a nested folder with parentId, and optionally move tabs into it (Zen pins them). If a folder with the same name already exists in that place, it is reused instead (created: false); pass allowDuplicate: true to always create a new one. Example: { "name": "Google", "spaceId": "{general-space-id}" }.',
    z.object({
      name: folderName,
      spaceId: spaceId
        .optional()
        .describe(
          "Space to create the folder in; defaults to the parent folder's space, or the active space",
        ),
      parentId: folderId.optional().describe("Parent folder; omit for a top-level folder"),
      tabIds: tabIds.optional(),
      allowDuplicate: z
        .boolean()
        .default(false)
        .describe("Create a new folder even if one with this name exists in the same place"),
    }),
    idempotentWrites,
    async (input) => {
      const folders = await fetchFolders();
      let targetSpaceId = input.spaceId;
      if (input.parentId) {
        const parent = folders.find((entry) => entry.id === input.parentId);
        if (!parent) {
          throw new Error(
            `Folder not found: ${input.parentId}. Get folder IDs from zen_list_folders.`,
          );
        }
        if (targetSpaceId && parent.spaceId !== targetSpaceId) {
          throw new Error(
            `Parent folder "${parent.name}" is in space "${parent.spaceName}" (${parent.spaceId}), not ${targetSpaceId}.`,
          );
        }
        targetSpaceId = parent.spaceId;
      }
      const space = pickSpace(await fetchSpaces(), targetSpaceId);

      const existing = input.allowDuplicate
        ? undefined
        : findReusableFolder(folders, input.name, space.id, input.parentId);

      if (existing) {
        const moved = input.tabIds
          ? await bridge.request({
              type: "moveTabsToFolder",
              tabIds: input.tabIds,
              folderId: existing.id,
            })
          : undefined;
        return {
          created: false,
          folderId: existing.id,
          name: existing.name,
          spaceId: space.id,
          spaceName: space.name,
          ...(input.parentId ? { parentId: input.parentId } : {}),
          ...(moved ? { movedTabs: moved } : {}),
        };
      }

      const result = v.parse(
        v.object({ folderId: v.string() }),
        await bridge.request({
          type: "createFolder",
          name: input.name,
          spaceId: space.id,
          parentId: input.parentId,
          tabIds: input.tabIds,
        }),
      );
      return {
        created: true,
        folderId: result.folderId,
        name: input.name,
        spaceId: space.id,
        spaceName: space.name,
        ...(input.parentId ? { parentId: input.parentId } : {}),
      };
    },
  );

  tool(
    "zen_rename_folder",
    "Rename a folder.",
    { folderId, name: folderName },
    idempotentWrites,
    (input) => ({ type: "renameFolder", folderId: input.folderId, name: input.name }),
  );

  tool(
    "zen_move_folder",
    "Move a folder to another space and/or parent folder without switching space. Omit parentId to place it at the space root. Essential tabs inside the folder cannot be moved.",
    {
      folderId,
      spaceId: spaceId.optional().describe("Target space; defaults to the parent folder's space"),
      parentId: folderId.optional().describe("Target parent folder; omit for the space root"),
      afterFolderId: folderId.optional().describe("Place this folder directly after that folder"),
    },
    idempotentWrites,
    (input) => ({
      type: "moveFolder",
      folderId: input.folderId,
      spaceId: input.spaceId,
      parentId: input.parentId,
      afterFolderId: input.afterFolderId,
    }),
  );

  tool(
    "zen_delete_folder",
    "Delete empty folders. Fails if any still has tabs or subfolders; move those out first. Nested empty folders are deleted innermost first.",
    { folderIds },
    destructive,
    (input) => ({ type: "deleteFolder", folderIds: input.folderIds }),
  );

  tool(
    "zen_delete_space",
    "Delete spaces and the tabs in them (essentials are kept). Cannot delete the last remaining space.",
    { spaceIds },
    destructive,
    (input) => ({ type: "deleteSpace", spaceIds: input.spaceIds }),
  );

  tool(
    "zen_set_essential",
    "Mark tabs as essential. Essentials are shared by every space and cannot be moved into a folder or another space until zen_clear_essential is called.",
    { tabIds },
    idempotentWrites,
    (input) => ({ type: "setEssential", tabIds: input.tabIds }),
  );

  tool(
    "zen_clear_essential",
    "Remove tabs from Essentials so they can be moved into a folder or another space.",
    { tabIds },
    idempotentWrites,
    (input) => ({ type: "clearEssential", tabIds: input.tabIds }),
  );

  tool("zen_close_tab", "Close tabs.", { tabIds }, destructive, (input) => ({
    type: "closeTab",
    tabIds: input.tabIds,
  }));

  tool(
    "zen_move_tabs_to_folder",
    "Move tabs into a folder. The tabs are pinned and moved to the folder's space.",
    { tabIds, folderId },
    idempotentWrites,
    (input) => ({ type: "moveTabsToFolder", tabIds: input.tabIds, folderId: input.folderId }),
  );

  tool(
    "zen_remove_tabs_from_folder",
    "Take tabs out of their folder. They stay in the same space.",
    { tabIds },
    idempotentWrites,
    (input) => ({ type: "removeTabsFromFolder", tabIds: input.tabIds }),
  );

  tool(
    "zen_move_tabs_to_space",
    "Move tabs to another space without switching to it. Essential tabs cannot be moved.",
    { tabIds, spaceId },
    idempotentWrites,
    (input) => ({ type: "moveTabsToSpace", tabIds: input.tabIds, spaceId: input.spaceId }),
  );

  tool(
    "zen_list_timers",
    "List the running tab timers with the tab, its label and when it ends (endsAt, ISO time). Timers that have already passed are not listed.",
    {},
    readOnly,
    () => ({ type: "listTimers" }),
  );

  tool(
    "zen_set_timer",
    'Set the same timer on one or more tabs, replacing any timer they already have. "when" takes the same text as the extension\'s timer field: a duration ("30m", "1h 30m", "1d 30m"), a preset ("30 minutes", "1 hour", "7 hours", "Tomorrow 9:00", "Next week"), or a time ("tomorrow at 9am"). A timer must end between 1 minute and 31 days from now. Example: { "tabIds": [118, 119], "when": "45m" }.',
    {
      tabIds,
      when: z.string().trim().min(1).max(100).describe("When the timer ends, as text"),
    },
    idempotentWrites,
    (input) => ({ type: "setTimer", tabIds: input.tabIds, when: input.when }),
  );

  tool(
    "zen_clear_timer",
    "Remove timers from tabs. Reports how many of those tabs actually had a timer.",
    { tabIds },
    idempotentWrites,
    (input) => ({ type: "clearTimer", tabIds: input.tabIds }),
  );

  tool(
    "zen_list_todos",
    "List tabs marked as todo, in tab order, with the tab, its title and where it sits.",
    {},
    readOnly,
    () => ({ type: "listTodos" }),
  );

  tool(
    "zen_set_todo",
    'Mark tabs as todo, so they show in the extension\'s todo column. Example: { "tabIds": [118, 119] }.',
    { tabIds },
    idempotentWrites,
    (input) => ({ type: "setTodo", tabIds: input.tabIds, status: "todo" }),
  );

  tool(
    "zen_clear_todo",
    "Mark tabs' todos as done, which removes them from the todo list. Reports how many of those tabs were actually todos.",
    { tabIds },
    idempotentWrites,
    (input) => ({ type: "clearTodo", tabIds: input.tabIds }),
  );

  tool(
    "zen_list_colors",
    "List tabs that have a traffic-light color (red, orange or green), in tab order, with the tab, its title and where it sits. Colors also appear as `color` on zen_list_tabs. Independent of todos.",
    {},
    readOnly,
    () => ({ type: "listStatuses" }),
  );

  tool(
    "zen_set_color",
    'Set the same traffic-light color on one or more tabs, replacing any color they already have. Colors are independent of todos. Example: { "tabIds": [118, 119], "color": "green" }.',
    {
      tabIds,
      color: z.enum(TRAFFIC_LIGHTS).describe("red, orange or green"),
    },
    idempotentWrites,
    (input) => ({ type: "setStatus", tabIds: input.tabIds, light: input.color }),
  );

  tool(
    "zen_clear_color",
    "Clear traffic-light colors from tabs. Reports how many of those tabs actually had a color.",
    { tabIds },
    idempotentWrites,
    (input) => ({ type: "clearStatus", tabIds: input.tabIds }),
  );

  tool(
    "zen_detect_forge_tabs",
    'Find every open GitHub or GitLab tab (issues, pull requests, merge requests) and label it with its number and title, the same labels the extension gives a selected tab. Covers all open tabs unless tabIds is given. Set dryRun: true to preview the labels without renaming anything. Example: { "dryRun": true }.',
    {
      tabIds: z
        .array(tabId)
        .max(500)
        .optional()
        .describe("Only these tabs; omit to check every open tab"),
      dryRun: z.boolean().default(false).describe("Report the labels without renaming tabs"),
    },
    writes,
    (input) => ({ type: "detectForgeTabs", tabIds: input.tabIds, dryRun: input.dryRun }),
  );

  workflow(
    "zen_apply_patch",
    'Apply a PATCH-style tree of spaces, folders and tabs. Nested children inherit spaceId and folderId from their parent. Nodes with an id are patched (rename and/or move); nodes without an id are created (name required, and new tabs also need a url). Does not close tabs or delete folders. Set dryRun: true to get the plan without changing Zen. Example: { "nodes": [{ "type": "space", "name": "Work", "children": [{ "type": "folder", "name": "Docs", "children": [{ "type": "tab", "name": "Drive", "url": "https://drive.google.com/" }] }] }] }.',
    z.object({
      nodes: z
        .array(patchTreeNode)
        .min(1)
        .max(200)
        .describe("Root patch nodes; nest folders and tabs under a space to inherit its id"),
      dryRun: z.boolean().default(false).describe("Return the per-node plan without calling Zen"),
    }),
    writes,
    async (input) => {
      const [spaces, folders, tabs] = await Promise.all([
        fetchSpaces(),
        fetchFolders(),
        fetchTabs({}),
      ]);
      return applyPatchTree(input.nodes, {
        dryRun: input.dryRun,
        snapshot: { spaces, folders, tabs },
        request: (command) => bridge.request(command),
      });
    },
  );

  tool(
    "zen_move_tab",
    "Reorder a tab so it sits directly before or after another tab in the same space.",
    {
      tabId,
      targetTabId: tabId,
      position: z.enum(["before", "after"]),
    },
    idempotentWrites,
    (input) =>
      input.position === "before"
        ? { type: "moveTabBefore", tabId: input.tabId, targetTabId: input.targetTabId }
        : { type: "moveTabAfter", tabId: input.tabId, targetTabId: input.targetTabId },
  );
}
