import * as v from "valibot";

const tabIdSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const optionalTabIdSchema = v.optional(tabIdSchema);
const optionalDomIdSchema = v.optional(v.pipe(v.string(), v.minLength(1)));

export const tabInfoSchema = v.object({
  id: v.union([v.number(), v.null()]),
  domId: v.optional(v.string()),
  title: v.fallback(v.string(), "Untitled"),
  customLabel: v.optional(v.string()),
  url: v.fallback(v.string(), ""),
  favIconUrl: v.fallback(v.string(), ""),
  windowId: v.fallback(v.number(), -1),
  workspaceId: v.optional(v.string()),
  workspaceName: v.optional(v.string()),
  score: v.optional(v.number()),
  active: v.optional(v.boolean()),
});

export const spaceInfoSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.fallback(v.string(), ""),
  icon: v.optional(v.string()),
  isActive: v.fallback(v.boolean(), false),
  score: v.optional(v.number()),
});

export const tabTimerSchema = v.object({
  tabId: tabIdSchema,
  endAt: v.number(),
  originalLabel: v.fallback(v.string(), ""),
  title: v.fallback(v.string(), ""),
});

export const forgePageInfoSchema = v.object({
  title: v.optional(v.string()),
  bodyText: v.optional(v.string()),
});

export const errorResponseSchema = v.object({
  error: v.string(),
});

export const extensionRequestSchema = v.variant("type", [
  v.object({
    type: v.literal("getTabs"),
    anchorTabId: optionalTabIdSchema,
  }),
  v.object({
    type: v.literal("getSpaces"),
    anchorTabId: optionalTabIdSchema,
  }),
  v.object({
    type: v.literal("getDebugInfo"),
    anchorTabId: optionalTabIdSchema,
  }),
  v.object({
    type: v.literal("switchTab"),
    tabId: optionalTabIdSchema,
    domId: optionalDomIdSchema,
    anchorTabId: optionalTabIdSchema,
  }),
  v.object({
    type: v.literal("switchSpace"),
    spaceId: v.pipe(v.string(), v.minLength(1)),
    anchorTabId: optionalTabIdSchema,
  }),
  v.object({
    type: v.literal("getTab"),
    tabId: tabIdSchema,
  }),
  v.object({
    type: v.literal("getSnapshot"),
    anchorTabId: optionalTabIdSchema,
  }),
  v.object({
    type: v.literal("getTimers"),
  }),
  v.object({
    type: v.literal("setTimer"),
    tabId: tabIdSchema,
    endAt: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("clearTimer"),
    tabId: tabIdSchema,
  }),
  v.object({
    type: v.literal("clearAllTimers"),
  }),
]);

export const contentCommandSchema = v.variant("type", [
  v.object({
    type: v.literal("getForgePageInfo"),
  }),
  v.object({
    type: v.literal("toggleOmnibar"),
    anchorTabId: optionalTabIdSchema,
  }),
  v.object({
    type: v.literal("showOmnibar"),
  }),
]);

export const SNAPSHOT_CHANGED_TYPE = "snapshotChanged" as const;

export const snapshotChangedSchema = v.object({
  type: v.literal(SNAPSHOT_CHANGED_TYPE),
});

export const searchSnapshotSchema = v.object({
  tabs: v.array(tabInfoSchema),
  spaces: v.array(spaceInfoSchema),
  timers: v.array(tabTimerSchema),
});

export const EXTENSION_REQUEST_TYPES = [
  "getTabs",
  "getSpaces",
  "getDebugInfo",
  "switchTab",
  "switchSpace",
  "getTab",
  "getSnapshot",
  "getTimers",
  "setTimer",
  "clearTimer",
  "clearAllTimers",
] as const;

export type ExtensionRequestType = (typeof EXTENSION_REQUEST_TYPES)[number];
export type ExtensionRequest = v.InferOutput<typeof extensionRequestSchema>;
export type ContentCommand = v.InferOutput<typeof contentCommandSchema>;
export type ErrorResponse = v.InferOutput<typeof errorResponseSchema>;

export type ClearTimerResponse = { success: true; cleared: boolean };
export type ClearAllTimersResponse = { success: true; cleared: number };
export type SearchSnapshot = v.InferOutput<typeof searchSnapshotSchema>;

export type ExtensionSuccessMap = {
  getTabs: v.InferOutput<typeof tabInfoSchema>[];
  getSpaces: v.InferOutput<typeof spaceInfoSchema>[];
  getDebugInfo: unknown;
  switchTab: void;
  switchSpace: void;
  getTab: v.InferOutput<typeof tabInfoSchema>;
  getSnapshot: SearchSnapshot;
  getTimers: v.InferOutput<typeof tabTimerSchema>[];
  setTimer: v.InferOutput<typeof tabTimerSchema>;
  clearTimer: ClearTimerResponse;
  clearAllTimers: ClearAllTimersResponse;
};

const clearTimerResponseSchema = v.object({
  success: v.literal(true),
  cleared: v.boolean(),
});

const clearAllTimersResponseSchema = v.object({
  success: v.literal(true),
  cleared: v.number(),
});

export function isExtensionRequestType(value: unknown): value is ExtensionRequestType {
  return (
    typeof value === "string" && (EXTENSION_REQUEST_TYPES as readonly string[]).includes(value)
  );
}

export function isErrorResponse(value: unknown): value is ErrorResponse {
  return v.is(errorResponseSchema, value);
}

export function parseExtensionRequest(value: unknown): ExtensionRequest {
  return v.parse(extensionRequestSchema, value);
}

export function parseContentCommand(value: unknown): ContentCommand | undefined {
  const parsed = v.safeParse(contentCommandSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function isSnapshotChangedMessage(value: unknown): boolean {
  return v.is(snapshotChangedSchema, value);
}

export function parseStoredTimer(value: unknown): v.InferOutput<typeof tabTimerSchema> | undefined {
  const parsed = v.safeParse(tabTimerSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function parseStoredTimers(
  value: unknown,
): Record<string, v.InferOutput<typeof tabTimerSchema>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const timers: Record<string, v.InferOutput<typeof tabTimerSchema>> = {};
  for (const entry of Object.values(value as Record<string, unknown>)) {
    const parsed = parseStoredTimer(entry);
    if (!parsed) {
      continue;
    }
    timers[String(parsed.tabId)] = parsed;
  }
  return timers;
}

export function parseExtensionSuccess<T extends ExtensionRequestType>(
  type: T,
  value: unknown,
): ExtensionSuccessMap[T] {
  switch (type) {
    case "getTabs":
      return v.parse(v.array(tabInfoSchema), value) as ExtensionSuccessMap[T];
    case "getSpaces":
      return v.parse(v.array(spaceInfoSchema), value) as ExtensionSuccessMap[T];
    case "getDebugInfo":
      return value as ExtensionSuccessMap[T];
    case "switchTab":
    case "switchSpace":
      return undefined as ExtensionSuccessMap[T];
    case "getTab":
      return v.parse(tabInfoSchema, value) as ExtensionSuccessMap[T];
    case "getSnapshot":
      return v.parse(searchSnapshotSchema, value) as ExtensionSuccessMap[T];
    case "getTimers":
      return v.parse(v.array(tabTimerSchema), value) as ExtensionSuccessMap[T];
    case "setTimer":
      return v.parse(tabTimerSchema, value) as ExtensionSuccessMap[T];
    case "clearTimer":
      return v.parse(clearTimerResponseSchema, value) as ExtensionSuccessMap[T];
    case "clearAllTimers":
      return v.parse(clearAllTimersResponseSchema, value) as ExtensionSuccessMap[T];
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled message type: ${String(exhaustive)}`);
    }
  }
}

export function invalidRequestMessage(type: ExtensionRequestType): string {
  switch (type) {
    case "switchSpace":
      return "Invalid space ID.";
    case "getTab":
      return "No tab selected for the timer.";
    case "setTimer":
      return "Timer duration must be between 1 minute and 31 days.";
    case "clearTimer":
    case "switchTab":
      return "Invalid tab ID.";
    default:
      return "Invalid message.";
  }
}
