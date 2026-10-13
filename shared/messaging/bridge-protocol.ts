import * as v from "valibot";
import { folderInfoSchema, TODO_STATUSES } from "@/shared/messaging/protocol";

/**
 * Wire protocol between the Zen extension and the local MCP server
 * (`mcp/`). The extension dials out to a WebSocket that the MCP server
 * listens on, bound to loopback. Every connection must present the shared
 * token before it may send commands.
 */

export const BRIDGE_PORT = 47652;
export const BRIDGE_URL = `ws://127.0.0.1:${BRIDGE_PORT}`;
export const BRIDGE_TOKEN_STORAGE_KEY = "mcpBridgeToken";
// Bump when a command is added or changed, so mismatched releases say so.
export const BRIDGE_PROTOCOL_VERSION = 4;

const tabIdSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const tabIdsSchema = v.pipe(v.array(tabIdSchema), v.minLength(1), v.maxLength(200));
const idSchema = v.pipe(v.string(), v.minLength(1));
const folderNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));
// Agents may only open ordinary web pages: no javascript:, file:, about: or extension URLs.
const webUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2048),
  v.url(),
  v.check((url) => /^https?:\/\//i.test(url), "Only http and https URLs can be opened."),
);

export const zenFolderInfoSchema = v.object({
  id: v.string(),
  name: v.string(),
  spaceId: v.string(),
  spaceName: v.string(),
  parentId: v.optional(v.string()),
  collapsed: v.boolean(),
});

/** A tab as it crosses the bridge: `TabInfo` without the favicon. */
export const tabSummarySchema = v.object({
  id: v.number(),
  title: v.string(),
  customLabel: v.optional(v.string()),
  url: v.string(),
  windowId: v.number(),
  spaceId: v.optional(v.string()),
  spaceName: v.optional(v.string()),
  folderId: v.optional(v.string()),
  folderName: v.optional(v.string()),
  folderPath: v.optional(v.array(folderInfoSchema)),
  essential: v.optional(v.boolean()),
  active: v.optional(v.boolean()),
});

export const bridgeCommandSchema = v.variant("type", [
  v.object({ type: v.literal("listSpaces") }),
  v.object({
    type: v.literal("listTabs"),
    spaceId: v.optional(idSchema),
    folderId: v.optional(idSchema),
  }),
  v.object({ type: v.literal("listFolders") }),
  v.object({ type: v.literal("getSelectedTabs") }),
  v.object({ type: v.literal("activateTab"), tabId: tabIdSchema }),
  v.object({ type: v.literal("switchSpace"), spaceId: idSchema }),
  v.object({
    type: v.literal("renameTab"),
    tabId: tabIdSchema,
    // Empty clears the custom name and falls back to the page title.
    label: v.pipe(v.string(), v.maxLength(200)),
  }),
  v.object({
    type: v.literal("createFolder"),
    name: folderNameSchema,
    spaceId: v.optional(idSchema),
    tabIds: v.optional(tabIdsSchema),
  }),
  v.object({
    type: v.literal("renameFolder"),
    folderId: idSchema,
    name: folderNameSchema,
  }),
  v.object({
    type: v.literal("moveTabsToFolder"),
    tabIds: tabIdsSchema,
    folderId: idSchema,
  }),
  v.object({ type: v.literal("removeTabsFromFolder"), tabIds: tabIdsSchema }),
  v.object({
    type: v.literal("moveTabsToSpace"),
    tabIds: tabIdsSchema,
    spaceId: idSchema,
  }),
  v.object({
    type: v.literal("moveTabBefore"),
    tabId: tabIdSchema,
    targetTabId: tabIdSchema,
  }),
  v.object({
    type: v.literal("moveTabAfter"),
    tabId: tabIdSchema,
    targetTabId: tabIdSchema,
  }),
  v.object({
    type: v.literal("openTab"),
    url: webUrlSchema,
    spaceId: v.optional(idSchema),
    folderId: v.optional(idSchema),
    active: v.optional(v.boolean(), false),
    pinned: v.optional(v.boolean(), false),
  }),
  v.object({ type: v.literal("listTimers") }),
  v.object({
    type: v.literal("setTimer"),
    tabId: tabIdSchema,
    // Same text the timer popup accepts: "30m", "1h 30m", "tomorrow at 9am", or a preset label.
    when: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  }),
  v.object({ type: v.literal("clearTimer"), tabId: tabIdSchema }),
  v.object({ type: v.literal("listTodos") }),
  v.object({
    type: v.literal("setTodo"),
    tabId: tabIdSchema,
    status: v.picklist(TODO_STATUSES),
  }),
  v.object({ type: v.literal("clearTodo"), tabId: tabIdSchema }),
  v.object({
    type: v.literal("detectForgeTabs"),
    // Empty or missing means every open tab.
    tabIds: v.optional(v.pipe(v.array(tabIdSchema), v.maxLength(500))),
    // Report what would be labelled without renaming anything.
    dryRun: v.optional(v.boolean(), false),
  }),
]);

/** One tab that forge detection looked at. */
export const forgeDetectionResultSchema = v.object({
  tabId: tabIdSchema,
  url: v.string(),
  /** The GitHub or GitLab label the tab gets (or would get). */
  label: v.string(),
  platform: v.picklist(["github", "gitlab"]),
  applied: v.boolean(),
});

export const bridgeRequestSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  command: bridgeCommandSchema,
});

export const bridgeHelloSchema = v.object({
  type: v.literal("hello"),
  token: v.string(),
  protocolVersion: v.literal(BRIDGE_PROTOCOL_VERSION),
});

export type BridgeCommand = v.InferOutput<typeof bridgeCommandSchema>;
export type BridgeCommandType = BridgeCommand["type"];
export type BridgeRequest = v.InferOutput<typeof bridgeRequestSchema>;
export type ZenFolderInfo = v.InferOutput<typeof zenFolderInfoSchema>;
export type TabSummary = v.InferOutput<typeof tabSummarySchema>;

export type BridgeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

export function parseBridgeRequest(value: unknown): BridgeRequest | undefined {
  const parsed = v.safeParse(bridgeRequestSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function parseBridgeHello(value: unknown): { token: string } | undefined {
  const parsed = v.safeParse(bridgeHelloSchema, value);
  return parsed.success ? { token: parsed.output.token } : undefined;
}
