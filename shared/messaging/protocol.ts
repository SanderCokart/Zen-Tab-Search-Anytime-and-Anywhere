import * as v from "valibot";

const tabIdSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const optionalTabIdSchema = v.optional(tabIdSchema);
const optionalDomIdSchema = v.optional(v.pipe(v.string(), v.minLength(1)));

export const folderInfoSchema = v.object({
  id: v.string(),
  name: v.string(),
});

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
  folderId: v.optional(v.string()),
  folderName: v.optional(v.string()),
  folderPath: v.optional(v.array(folderInfoSchema)),
  essential: v.optional(v.boolean()),
  lastOpenedAt: v.optional(v.number()),
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
  /** Identifies the timer across browser sessions, which give tabs new IDs. */
  timerId: v.string(),
  tabId: tabIdSchema,
  endAt: v.number(),
  originalLabel: v.fallback(v.string(), ""),
  title: v.fallback(v.string(), ""),
  /** The tab's URL, which helps find the tab again after a restart. */
  url: v.fallback(v.string(), ""),
});

/** Timers saved before timer IDs existed have none; the timer service assigns one. */
export const storedTabTimerSchema = v.object({
  ...tabTimerSchema.entries,
  timerId: v.optional(v.string()),
});

export const TODO_STATUSES = ["todo"] as const;

/** A tab the user marked as a todo. Marking it done removes the entry. */
export const tabTodoSchema = v.object({
  tabId: tabIdSchema,
  status: v.picklist(TODO_STATUSES),
});

/** The traffic-light colors a tab's status can be set to. */
export const TRAFFIC_LIGHTS = ["red", "orange", "green"] as const;

/** A status color the user gave a tab. Any tab can have one, whether or not it is a todo. */
export const tabStatusSchema = v.object({
  tabId: tabIdSchema,
  light: v.picklist(TRAFFIC_LIGHTS),
});

export const forgePageInfoSchema = v.object({
  title: v.optional(v.string()),
  bodyText: v.optional(v.string()),
});

/** A hostname a host override matches: exact, or `*.example.com` for every subdomain. */
const HOST_PATTERN =
  /^(\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const hostPatternSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.transform((value) => value.replace(/\.$/, "")),
  v.regex(HOST_PATTERN, "Hostnames look like example.com or *.example.com."),
);

/**
 * One IP and every hostname a tab sends to it instead of what DNS says, like a
 * block of lines in a hosts file. The description names the target ("Staging")
 * in notifications and tooltips.
 */
export const hostOverrideGroupSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  ip: v.pipe(
    v.string(),
    v.trim(),
    // Accept "[::1]" as typed in a URL.
    v.transform((value) => value.replace(/^\[(.*)\]$/, "$1")),
    v.ip("Enter a valid IPv4 or IPv6 address."),
  ),
  description: v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep the description short.")),
  hostnames: v.pipe(
    v.array(hostPatternSchema),
    v.minLength(1, "Add at least one hostname."),
    v.maxLength(100, "Use at most 100 hostnames per IP."),
  ),
  enabled: v.boolean(),
});

export const hostOverrideListSchema = v.pipe(
  v.array(hostOverrideGroupSchema),
  v.maxLength(50, "Use at most 50 IPs per tab."),
);

/**
 * How a host override IP's loopback proxy is doing, for the editor's status line.
 * `routed` counts requests the background sent to it; the rest come from the proxy.
 */
export const hostProxyStatusSchema = v.object({
  ip: v.string(),
  port: v.optional(v.number()),
  routed: v.number(),
  connected: v.number(),
  open: v.number(),
  lastError: v.fallback(v.string(), ""),
});

/** Every host override proxy's status, plus the file the proxies log failures to. */
export const hostProxyReportSchema = v.object({
  logPath: v.fallback(v.string(), ""),
  proxies: v.array(hostProxyStatusSchema),
});

/** The newest published release: its version, its Firefox zip and its release page. */
export const latestReleaseSchema = v.object({
  version: v.string(),
  zipUrl: v.string(),
  releaseUrl: v.string(),
});

/**
 * The installed version and the newest release the last check found, if any.
 * `canInstall` says whether the in-place install is available in this browser.
 * `demo` marks a debug build offering a release that is not newer, to replace itself.
 * `checkedAt` is when GitHub last answered, or null when it never has; a forced
 * check that leaves it unchanged failed.
 */
export const updateStatusSchema = v.object({
  currentVersion: v.string(),
  latest: v.nullable(latestReleaseSchema),
  updateAvailable: v.boolean(),
  demo: v.boolean(),
  canInstall: v.boolean(),
  checkedAt: v.nullable(v.number()),
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
    type: v.literal("openTimerPopup"),
    tabId: tabIdSchema,
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
  v.object({
    type: v.literal("openSettings"),
  }),
  v.object({
    type: v.literal("setTabLabel"),
    tabId: tabIdSchema,
    label: v.string(),
  }),
  v.object({
    type: v.literal("setTodo"),
    tabId: tabIdSchema,
    /** "none" removes the tab from the todo list, which is what marking it done means. */
    status: v.picklist([...TODO_STATUSES, "none"]),
  }),
  v.object({
    type: v.literal("setTabStatus"),
    tabId: tabIdSchema,
    /** "none" clears the tab's status color. */
    light: v.picklist([...TRAFFIC_LIGHTS, "none"]),
  }),
  v.object({
    type: v.literal("clearTodos"),
    /** The todo tabs to mark done, as the todo column chose them. */
    tabIds: v.array(tabIdSchema),
  }),
  v.object({
    type: v.literal("getHostOverrides"),
    tabId: tabIdSchema,
  }),
  v.object({
    type: v.literal("setHostOverrides"),
    tabId: tabIdSchema,
    groups: hostOverrideListSchema,
  }),
  v.object({
    type: v.literal("getGlobalHostOverrides"),
  }),
  v.object({
    type: v.literal("setGlobalHostOverrides"),
    groups: hostOverrideListSchema,
  }),
  v.object({
    type: v.literal("getHostProxyStatus"),
  }),
  v.object({
    type: v.literal("openHostOverridesPopup"),
    tabId: tabIdSchema,
  }),
  v.object({
    type: v.literal("hideOmnibar"),
  }),
  v.object({
    type: v.literal("getUpdateStatus"),
    /** Asks GitHub now instead of using a check from the last few hours. */
    force: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal("openUpdate"),
    /** The release zip, which Firefox downloads, or the release page with its notes. */
    page: v.picklist(["download", "releaseNotes"]),
  }),
  v.object({
    type: v.literal("installUpdate"),
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

/** Broadcast when the window-hosted omnibar is shown, so its page remounts fresh. */
export const OMNIBAR_SHOWN_TYPE = "omnibarShown" as const;

/** A panel the omnibar shows in place of its tab, issue and todo columns. */
export const omnibarViewSchema = v.variant("kind", [
  v.object({ kind: v.literal("timers") }),
  v.object({ kind: v.literal("timer"), tabId: tabIdSchema }),
  v.object({ kind: v.literal("hosts"), tabId: tabIdSchema }),
  /** The search itself, opened with a query already typed. */
  v.object({ kind: v.literal("search"), query: v.string() }),
]);

export const omnibarShownSchema = v.object({
  type: v.literal(OMNIBAR_SHOWN_TYPE),
  overlayId: v.string(),
  view: v.optional(omnibarViewSchema),
});

export const searchSnapshotSchema = v.object({
  tabs: v.array(tabInfoSchema),
  spaces: v.array(spaceInfoSchema),
  timers: v.array(tabTimerSchema),
  todos: v.fallback(v.array(tabTodoSchema), []),
  statuses: v.fallback(v.array(tabStatusSchema), []),
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
  "openTimerPopup",
  "setTimer",
  "clearTimer",
  "clearAllTimers",
  "openSettings",
  "setTabLabel",
  "setTodo",
  "setTabStatus",
  "clearTodos",
  "getHostOverrides",
  "setHostOverrides",
  "getGlobalHostOverrides",
  "setGlobalHostOverrides",
  "getHostProxyStatus",
  "openHostOverridesPopup",
  "hideOmnibar",
  "getUpdateStatus",
  "openUpdate",
  "installUpdate",
] as const;

/**
 * Domain types inferred from the schemas above. These are the single source of
 * truth for the wire format and the in-memory shape alike; `@/lib/types`
 * re-exports them so feature code does not have to reach into the protocol.
 */
export type FolderInfo = v.InferOutput<typeof folderInfoSchema>;
export type ForgePageInfo = v.InferOutput<typeof forgePageInfoSchema>;
export type TabInfo = v.InferOutput<typeof tabInfoSchema>;
export type TabTimer = v.InferOutput<typeof tabTimerSchema>;
export type StoredTabTimer = v.InferOutput<typeof storedTabTimerSchema>;
export type SpaceInfo = v.InferOutput<typeof spaceInfoSchema>;
export type TabTodo = v.InferOutput<typeof tabTodoSchema>;
export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TabStatus = v.InferOutput<typeof tabStatusSchema>;
export type TrafficLight = (typeof TRAFFIC_LIGHTS)[number];
export type HostOverrideGroup = v.InferOutput<typeof hostOverrideGroupSchema>;
export type HostProxyStatus = v.InferOutput<typeof hostProxyStatusSchema>;
export type HostProxyReport = v.InferOutput<typeof hostProxyReportSchema>;
export type LatestRelease = v.InferOutput<typeof latestReleaseSchema>;
export type UpdateStatus = v.InferOutput<typeof updateStatusSchema>;

export type ExtensionRequestType = (typeof EXTENSION_REQUEST_TYPES)[number];
export type ExtensionRequest = v.InferOutput<typeof extensionRequestSchema>;
export type ContentCommand = v.InferOutput<typeof contentCommandSchema>;
export type ErrorResponse = v.InferOutput<typeof errorResponseSchema>;
export type OmnibarView = v.InferOutput<typeof omnibarViewSchema>;
export type OmnibarShown = v.InferOutput<typeof omnibarShownSchema>;

export type ClearTimerResponse = { success: true; cleared: boolean };
export type ClearAllTimersResponse = { success: true; cleared: number };
export type SearchSnapshot = v.InferOutput<typeof searchSnapshotSchema>;

export type ExtensionSuccessMap = {
  getTabs: TabInfo[];
  getSpaces: SpaceInfo[];
  getDebugInfo: unknown;
  switchTab: void;
  switchSpace: void;
  getTab: TabInfo;
  getSnapshot: SearchSnapshot;
  getTimers: TabTimer[];
  openTimerPopup: void;
  setTimer: TabTimer;
  clearTimer: ClearTimerResponse;
  clearAllTimers: ClearAllTimersResponse;
  openSettings: void;
  setTabLabel: void;
  setTodo: void;
  setTabStatus: void;
  clearTodos: void;
  getHostOverrides: HostOverrideGroup[];
  setHostOverrides: HostOverrideGroup[];
  getGlobalHostOverrides: HostOverrideGroup[];
  setGlobalHostOverrides: HostOverrideGroup[];
  getHostProxyStatus: HostProxyReport;
  openHostOverridesPopup: void;
  hideOmnibar: void;
  getUpdateStatus: UpdateStatus;
  openUpdate: void;
  installUpdate: void;
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

export function parseOmnibarShownMessage(value: unknown): OmnibarShown | undefined {
  const parsed = v.safeParse(omnibarShownSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function parseOmnibarView(value: unknown): OmnibarView | undefined {
  const parsed = v.safeParse(omnibarViewSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function parseStoredTimer(value: unknown): StoredTabTimer | undefined {
  const parsed = v.safeParse(storedTabTimerSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function parseStoredTimers(value: unknown): Record<string, StoredTabTimer> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const timers: Record<string, StoredTabTimer> = {};
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
    case "openTimerPopup":
      return undefined as ExtensionSuccessMap[T];
    case "setTimer":
      return v.parse(tabTimerSchema, value) as ExtensionSuccessMap[T];
    case "clearTimer":
      return v.parse(clearTimerResponseSchema, value) as ExtensionSuccessMap[T];
    case "clearAllTimers":
      return v.parse(clearAllTimersResponseSchema, value) as ExtensionSuccessMap[T];
    case "openSettings":
    case "setTabLabel":
    case "setTodo":
    case "setTabStatus":
    case "clearTodos":
      return undefined as ExtensionSuccessMap[T];
    case "getHostOverrides":
    case "setHostOverrides":
    case "getGlobalHostOverrides":
    case "setGlobalHostOverrides":
      return v.parse(hostOverrideListSchema, value) as ExtensionSuccessMap[T];
    case "getHostProxyStatus":
      return v.parse(hostProxyReportSchema, value) as ExtensionSuccessMap[T];
    case "openHostOverridesPopup":
    case "hideOmnibar":
      return undefined as ExtensionSuccessMap[T];
    case "getUpdateStatus":
      return v.parse(updateStatusSchema, value) as ExtensionSuccessMap[T];
    case "openUpdate":
    case "installUpdate":
      return undefined as ExtensionSuccessMap[T];
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
    case "setTabLabel":
      return "Invalid tab ID.";
    case "setHostOverrides":
    case "setGlobalHostOverrides":
      return "Invalid host override.";
    default:
      return "Invalid message.";
  }
}
