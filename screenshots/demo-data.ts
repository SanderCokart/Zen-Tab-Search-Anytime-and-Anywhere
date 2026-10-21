import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import { ESSENTIAL_TAB_NAMES_KEY } from "@/features/search/ui/hooks/useEssentialTabNames";
import { DISPLAY_SETTINGS_STORAGE_KEY } from "@/features/settings/model/display-settings";
import type { SearchSnapshot } from "@/shared/messaging/protocol";
import type { HostOverrideGroup, HostProxyReport, SpaceInfo, TabInfo } from "@/shared/types";

const MINUTE = 60_000;
/** Fixed countdown lengths so screenshots do not depend on wall-clock time. */
const TIMER_LEAD_MS = 27 * MINUTE + 40_000;

function icon(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const WORK = "space-work";
const PERSONAL = "space-personal";
const RESEARCH = "space-research";

export const DEMO_SPACES: SpaceInfo[] = [
  { id: WORK, name: "Work", icon: "💼", isActive: true },
  { id: PERSONAL, name: "Personal", icon: "🏠", isActive: false },
  { id: RESEARCH, name: "Research", icon: "📚", isActive: false },
];

export const DEMO_TABS: TabInfo[] = [
  {
    id: 1,
    title: "Improve tab search",
    customLabel: "PR: #45 - Improve tab search",
    url: "https://github.com/example/zen-tab-search/pull/45",
    favIconUrl: icon("#3b82f6"),
    windowId: 1,
    workspaceId: WORK,
    workspaceName: "Work",
    folderId: "folder-search",
    folderName: "Search",
    folderPath: [
      { id: "folder-product", name: "Product" },
      { id: "folder-search", name: "Search" },
    ],
    lastOpenedAt: 1_700_000_400_000,
    active: true,
  },
  {
    id: 2,
    title: "Fix the search results",
    customLabel: "ISSUE: #123 - Fix the search results",
    url: "https://gitlab.com/example/zen-tab-search/-/issues/123",
    favIconUrl: icon("#fc6d26"),
    windowId: 1,
    workspaceId: WORK,
    workspaceName: "Work",
    folderId: "folder-search",
    folderName: "Search",
    folderPath: [
      { id: "folder-product", name: "Product" },
      { id: "folder-search", name: "Search" },
    ],
    lastOpenedAt: 1_700_000_300_000,
  },
  {
    id: 3,
    title: "Host override proxy",
    customLabel: "MR: !88 - Host override proxy",
    url: "https://gitlab.com/example/zen-tab-search/-/merge_requests/88",
    favIconUrl: icon("#fc6d26"),
    windowId: 1,
    workspaceId: WORK,
    workspaceName: "Work",
    folderId: "folder-infra",
    folderName: "Infra",
    folderPath: [
      { id: "folder-product", name: "Product" },
      { id: "folder-infra", name: "Infra" },
    ],
    lastOpenedAt: 1_700_000_200_000,
  },
  {
    id: 4,
    title: "Architecture guide",
    url: "https://docs.example.com/zen-tab-search/architecture",
    favIconUrl: icon("#22c55e"),
    windowId: 1,
    workspaceId: WORK,
    workspaceName: "Work",
    folderId: "folder-docs",
    folderName: "Docs",
    folderPath: [{ id: "folder-docs", name: "Docs" }],
    lastOpenedAt: 1_700_000_100_000,
  },
  {
    id: 5,
    title:
      "A very long personal note title that wraps when truncation is off and otherwise sits on one line",
    url: "https://notes.example.com/inbox/very-long-title",
    favIconUrl: icon("#a855f7"),
    windowId: 1,
    workspaceId: PERSONAL,
    workspaceName: "Personal",
    lastOpenedAt: 1_700_000_050_000,
  },
  {
    id: 6,
    title: "Mail",
    url: "https://mail.example.com/",
    favIconUrl: icon("#ef4444"),
    windowId: 1,
    workspaceId: WORK,
    workspaceName: "Work",
    essential: true,
    domId: "essential-mail",
  },
  {
    id: 7,
    title: "Calendar",
    url: "https://calendar.example.com/",
    favIconUrl: icon("#eab308"),
    windowId: 1,
    workspaceId: WORK,
    workspaceName: "Work",
    essential: true,
    domId: "essential-calendar",
  },
  {
    id: 8,
    title: "Research paper",
    url: "https://arxiv.org/abs/2401.00001",
    favIconUrl: icon("#64748b"),
    windowId: 1,
    workspaceId: RESEARCH,
    workspaceName: "Research",
    lastOpenedAt: 1_700_000_010_000,
  },
  {
    id: 9,
    title: "Staging dashboard",
    url: "https://app.staging.example.com/overview",
    favIconUrl: icon("#14b8a6"),
    windowId: 1,
    workspaceId: WORK,
    workspaceName: "Work",
    folderId: "folder-infra",
    folderName: "Infra",
    folderPath: [
      { id: "folder-product", name: "Product" },
      { id: "folder-infra", name: "Infra" },
    ],
    lastOpenedAt: 1_700_000_020_000,
  },
  {
    id: 10,
    title: "Release checklist",
    url: "https://docs.example.com/release",
    favIconUrl: icon("#f97316"),
    windowId: 1,
    workspaceId: WORK,
    workspaceName: "Work",
    folderId: "folder-docs",
    folderName: "Docs",
    folderPath: [{ id: "folder-docs", name: "Docs" }],
    lastOpenedAt: 1_700_000_030_000,
  },
];

export function demoSnapshot(now = Date.now()): SearchSnapshot {
  return {
    tabs: DEMO_TABS,
    spaces: DEMO_SPACES,
    timers: [
      {
        timerId: "demo-1",
        tabId: 1,
        endAt: now + TIMER_LEAD_MS,
        originalLabel: "PR: #45 - Improve tab search",
        title: "Improve tab search",
        url: "",
      },
      {
        timerId: "demo-4",
        tabId: 4,
        endAt: now + 8 * 60 * MINUTE,
        originalLabel: "",
        title: "Architecture guide",
        url: "",
      },
    ],
    todos: [
      { tabId: 2, status: "todo" },
      { tabId: 10, status: "todo" },
    ],
    statuses: [
      { tabId: 1, light: "green" },
      { tabId: 2, light: "orange" },
      { tabId: 10, light: "red" },
    ],
  };
}

export const DEMO_HOST_GROUPS: HostOverrideGroup[] = [
  {
    id: "staging",
    ip: "10.0.0.12",
    description: "Staging",
    hostnames: ["app.staging.example.com", "*.staging.example.com"],
    enabled: true,
  },
];

export const DEMO_GLOBAL_HOST_GROUPS: HostOverrideGroup[] = [
  {
    id: "docs-cdn",
    ip: "10.0.0.40",
    description: "Docs CDN",
    hostnames: ["docs.example.com"],
    enabled: false,
  },
];

export const DEMO_PROXY_REPORT: HostProxyReport = {
  logPath: "C:\\Users\\demo\\zen-hosts.log",
  proxies: [
    {
      ip: "10.0.0.12",
      port: 51234,
      routed: 12,
      connected: 4,
      open: 2,
      lastError: "",
    },
  ],
};

export const DEMO_ESSENTIAL_NAMES: Record<string, string> = {
  "essential-mail": "Inbox",
  "essential-calendar": "Week",
};

export function demoStorage(displaySettings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS) {
  return {
    [DISPLAY_SETTINGS_STORAGE_KEY]: displaySettings,
    [ESSENTIAL_TAB_NAMES_KEY]: DEMO_ESSENTIAL_NAMES,
  };
}
