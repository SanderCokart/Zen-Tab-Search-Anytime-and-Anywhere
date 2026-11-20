import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import * as v from "valibot";
import {
  tabSummarySchema,
  zenFolderInfoSchema,
  type BridgeCommand,
} from "@/shared/messaging/bridge-protocol";
import { spaceInfoSchema, TRAFFIC_LIGHTS } from "@/shared/messaging/protocol";
import type { ZenBridge } from "./bridge-server";
import { folderPath } from "./folders";
import { applyPatchTree, type PatchTreeNode } from "./patch-tree";
import { buildTabListView, TAB_FIELDS, TAB_GROUPINGS } from "./tab-view";

const tabId = z.number().int().min(0).describe("Tab ID from zen_list_tabs");
const tabIds = z.array(tabId).min(1).max(200).describe("Tab IDs from zen_list_tabs");
const spaceId = z.string().min(1).describe("Space ID from zen_list_tabs");
const spaceIds = z.array(spaceId).min(1).max(200).describe("Space IDs from zen_list_tabs");
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
  pinned: z
    .boolean()
    .optional()
    .describe(
      "Pin or unpin the tab. Tabs in a folder are always pinned; essential overrides this",
    ),
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

/**
 * Registers the MCP tools. Each tool validates its input with zod for the
 * agent, then forwards bridge commands; the extension validates them again
 * with valibot before touching Zen. Layout writes go through zen_apply_patch.
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

  server.registerTool(
    "zen_status",
    {
      description:
        "Whether Zen is connected, and if not why (token, version, port held). Call first if other zen_ tools fail.",
      annotations: readOnly,
    },
    async () => asText(bridge.status()),
  );

  workflow(
    "zen_list_tabs",
    'List tabs. Result always has totals (totalTabs, essentialTabs, tabsBySpace — empty spaces included). fields: "counts" | "titles" | "titles_urls" | "full". groupBy: "space" | "folder" | "none". Color is on each tab. Use latest IDs; they change if a tab is restored.',
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
        filtered: Boolean(input.spaceId || input.folderId),
      });
    },
  );

  workflow(
    "zen_list_folders",
    'Folders (including empty), with space, parent, and path such as "Work / repo / master".',
    z.object({}),
    readOnly,
    async () => {
      const folders = await fetchFolders();
      return folders.map((entry) => ({ ...entry, path: folderPath(folders, entry) }));
    },
  );

  tool(
    "zen_activate_tab",
    "Focus a tab (switches space if needed).",
    { tabId },
    writes,
    (input) => ({ type: "activateTab", tabId: input.tabId }),
  );

  tool("zen_close_tab", "Close tabs.", { tabIds }, destructive, (input) => ({
    type: "closeTab",
    tabIds: input.tabIds,
  }));

  tool(
    "zen_delete_folder",
    "Delete empty folders. Nested empties are removed innermost first.",
    { folderIds },
    destructive,
    (input) => ({ type: "deleteFolder", folderIds: input.folderIds }),
  );

  tool(
    "zen_delete_space",
    "Delete spaces and their tabs (essentials kept). Cannot delete the last space.",
    { spaceIds },
    destructive,
    (input) => ({ type: "deleteSpace", spaceIds: input.spaceIds }),
  );

  tool(
    "zen_list_timers",
    "Running tab timers (tab, label, endsAt). Expired timers are omitted.",
    {},
    readOnly,
    () => ({ type: "listTimers" }),
  );

  workflow(
    "zen_set_timer",
    'Set the same timer on tabs. Omit "when" to clear. Same text as the timer field: "45m", "1h 30m", "tomorrow at 9am". 1 minute–31 days.',
    z.object({
      tabIds,
      when: z.string().trim().min(1).max(100).optional().describe("When it ends; omit to clear"),
    }),
    idempotentWrites,
    async (input) => {
      if (!input.when) {
        return bridge.request({ type: "clearTimer", tabIds: input.tabIds });
      }
      return bridge.request({ type: "setTimer", tabIds: input.tabIds, when: input.when });
    },
  );

  tool("zen_list_todos", "Tabs marked as todo, with title and location.", {}, readOnly, () => ({
    type: "listTodos",
  }));

  tool(
    "zen_set_todo",
    'Mark tabs as todo, or "done" to clear them.',
    {
      tabIds,
      status: z.enum(["todo", "done"]).default("todo"),
    },
    idempotentWrites,
    (input) =>
      input.status === "done"
        ? { type: "clearTodo", tabIds: input.tabIds }
        : { type: "setTodo", tabIds: input.tabIds, status: "todo" },
  );

  tool(
    "zen_set_color",
    "Traffic-light color on tabs: red, orange, green, or none to clear. Also shown on zen_list_tabs.",
    {
      tabIds,
      color: z.enum([...TRAFFIC_LIGHTS, "none"]),
    },
    idempotentWrites,
    (input) =>
      input.color === "none"
        ? { type: "clearStatus", tabIds: input.tabIds }
        : { type: "setStatus", tabIds: input.tabIds, light: input.color },
  );

  tool(
    "zen_get_pinned_url",
    "Stored restore URL of a pinned/essential tab, plus the page open now.",
    { tabId },
    readOnly,
    (input) => ({ type: "getPinnedUrl", tabId: input.tabId }),
  );

  tool(
    "zen_set_pinned_url",
    "Set the restore URL of a pinned/essential tab. Does not navigate. http(s) only.",
    { tabId, url: webUrl },
    idempotentWrites,
    (input) => ({ type: "setPinnedUrl", tabId: input.tabId, url: input.url }),
  );

  tool(
    "zen_detect_forge_tabs",
    "Label open GitHub/GitLab issue, PR and MR tabs. dryRun previews without renaming.",
    {
      tabIds: z.array(tabId).max(500).optional().describe("Omit to check every open tab"),
      dryRun: z.boolean().default(false),
    },
    writes,
    (input) => ({ type: "detectForgeTabs", tabIds: input.tabIds, dryRun: input.dryRun }),
  );

  workflow(
    "zen_apply_patch",
    "Create, rename and move spaces, folders and tabs as a tree. Nested children inherit space/folder. Nodes with id are patched; without id are created (tabs need url). Does not close or delete. dryRun returns the plan. Use this instead of separate create/rename/move/open tools.",
    z.object({
      nodes: z
        .array(patchTreeNode)
        .min(1)
        .max(200)
        .describe("Root nodes; nest folders and tabs under a space"),
      dryRun: z.boolean().default(false),
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
    "Reorder a tab before or after another tab in the same space.",
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
