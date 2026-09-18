import { debugLog, debugWarn } from "@/lib/debug";
import { isUsableTabId, type SpaceInfo, type TabInfo } from "@/lib/types";
import { formatError, LOG_PREFIX } from "@/lib/background/log";
import { resolveAnchorTabId as resolveBrowserAnchorTabId, zenAnchorTabId } from "@/lib/background/zen/anchor";
import { getZenTabsApi, type ZenTabsApi } from "@/lib/background/zen/api";

export interface BrowserTabSnapshot {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  windowId?: number;
  active?: boolean;
  lastAccessed?: number;
}

export interface WorkspaceBrowserHost {
  queryTabs(queryInfo?: Record<string, boolean>): Promise<BrowserTabSnapshot[]>;
  getTab(tabId: number): Promise<BrowserTabSnapshot>;
  focusWindow(windowId: number): Promise<void>;
  activateTab(tabId: number): Promise<void>;
}

export interface WorkspaceAdapter {
  isAvailable(): boolean;
  apiMethodNames(): string[];
  resolveAnchorTabId(preferredTabId?: number): Promise<number | undefined>;
  listTabs(anchorTabId?: number): Promise<TabInfo[]>;
  getTab(tabId: number): Promise<TabInfo>;
  listSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
  getCustomLabels(tabIds: number[]): Promise<Record<number, string>>;
  activateTab(tabId?: number, domId?: string, anchorTabId?: number): Promise<void>;
  switchSpace(spaceId: string, anchorTabId?: number): Promise<void>;
  setLabel(label: string, anchorTabId?: number, silent?: boolean): Promise<boolean>;
  changeLabel(anchorTabId?: number): Promise<boolean>;
  getDebugInfo(anchorTabId?: number): Promise<unknown>;
}

export interface ZenWorkspaceAdapterOptions {
  getZenTabsApi?: () =>
    | (Partial<Omit<ZenTabsApi, "getDebugInfo">> & {
        getDebugInfo?: (anchorTabId?: number) => Promise<unknown>;
      })
    | undefined;
  resolveAnchorTabId?: (preferredTabId?: number) => Promise<number | undefined>;
  browser?: WorkspaceBrowserHost;
  logDebugInfo?: (context: string, anchorTabId?: number) => Promise<void>;
}

function defaultBrowserHost(): WorkspaceBrowserHost {
  return {
    queryTabs: (queryInfo = {}) => browser.tabs.query(queryInfo),
    getTab: (tabId) => browser.tabs.get(tabId),
    focusWindow: async (windowId) => {
      await browser.windows.update(windowId, { focused: true });
    },
    activateTab: async (tabId) => {
      await browser.tabs.update(tabId, { active: true });
    },
  };
}

function normalizeTabId(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : -1;
}

function resolveOriginalTabTitle(
  title: string | undefined,
  customLabel: string | undefined,
  fallbackTitle?: string,
): string {
  const displayed = title?.trim() || "";
  const custom = customLabel?.trim() || "";
  const fallback = fallbackTitle?.trim() || "";
  if (custom && displayed && displayed !== custom) {
    return displayed;
  }
  if (custom && fallback && fallback !== custom) {
    return fallback;
  }
  return displayed || fallback || custom || "Untitled";
}

function mapBrowserTabs(
  tabs: BrowserTabSnapshot[],
  labels: Record<number, string>,
  focusedTabId?: number,
): TabInfo[] {
  return tabs.map((tab) => {
    const tabId =
      typeof tab.id === "number" && Number.isInteger(tab.id) && tab.id >= 0 ? tab.id : -1;
    const customLabel = labels[tabId] ?? "";
    return {
      id: tabId,
      title: resolveOriginalTabTitle(tab.title, customLabel),
      customLabel,
      url: tab.url || "",
      favIconUrl: tab.favIconUrl || "",
      windowId: tab.windowId ?? -1,
      lastOpenedAt: tab.lastAccessed,
      active: tabId === focusedTabId,
    };
  });
}

export function createZenWorkspaceAdapter(
  options: ZenWorkspaceAdapterOptions = {},
): WorkspaceAdapter {
  const getApi = options.getZenTabsApi ?? getZenTabsApi;
  const resolveAnchor = options.resolveAnchorTabId ?? resolveBrowserAnchorTabId;
  const host = options.browser ?? defaultBrowserHost();
  const logDebugInfo = options.logDebugInfo;

  async function getCustomLabels(tabIds: number[]): Promise<Record<number, string>> {
    const zenTabs = getApi();
    if (!zenTabs?.getCustomLabels) {
      return {};
    }

    try {
      return await zenTabs.getCustomLabels(tabIds);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not read Zen custom tab labels:`, formatError(error));
      return {};
    }
  }

  async function listTabsFromZen(tabId?: number): Promise<TabInfo[] | undefined> {
    const zenTabs = getApi();
    if (!zenTabs?.getAllTabs) {
      return undefined;
    }

    try {
      debugLog(`${LOG_PREFIX} queryTabs via zenTabs.getAllTabs`, { anchorTabId: tabId });
      const tabs = await zenTabs.getAllTabs(zenAnchorTabId(tabId));
      if (!tabs) {
        return undefined;
      }
      const focusedTabId = await resolveAnchor(tabId);
      let browserTabsById = new Map<number, BrowserTabSnapshot>();
      try {
        browserTabsById = new Map(
          (await host.queryTabs({}))
            .filter(
              (tab): tab is BrowserTabSnapshot & { id: number } =>
                typeof tab.id === "number" && Number.isInteger(tab.id) && tab.id >= 0,
            )
            .map((tab) => [tab.id, tab]),
        );
      } catch {
        // Browser tab metadata is optional when the fallback host is unavailable.
      }
      return tabs.map((tab) => {
        const candidateTabId = normalizeTabId(tab.id);
        const browserTab = browserTabsById.get(candidateTabId);
        return {
          ...tab,
          id: candidateTabId,
          title: resolveOriginalTabTitle(tab.title, tab.customLabel, browserTab?.title),
          lastOpenedAt: browserTab?.lastAccessed ?? tab.lastOpenedAt,
          active: candidateTabId >= 0 && candidateTabId === focusedTabId,
        };
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not read tabs across Zen spaces:`, formatError(error));
      await logDebugInfo?.("queryTabs getAllTabs", tabId);
      return undefined;
    }
  }

  async function listTabs(anchorTabId?: number): Promise<TabInfo[]> {
    const tabId = await resolveAnchor(anchorTabId);
    const zenTabs = await listTabsFromZen(tabId);
    if (zenTabs) {
      return zenTabs;
    }

    const browserTabs = await host.queryTabs({});
    const tabIds = browserTabs
      .map((tab) => tab.id)
      .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id >= 0);
    const customLabels = await getCustomLabels(tabIds);
    const focusedTabId = await resolveAnchor(tabId);
    return mapBrowserTabs(browserTabs, customLabels, focusedTabId);
  }

  async function getTab(tabId: number): Promise<TabInfo> {
    const tabs = await listTabs(tabId);
    const match = tabs.find((tab) => tab.id === tabId);
    if (match) {
      return match;
    }

    const tab = await host.getTab(tabId);
    const labels = await getCustomLabels([tabId]);
    const customLabel = labels[tabId] ?? "";
    return {
      id: tab.id ?? tabId,
      title: resolveOriginalTabTitle(tab.title, customLabel),
      customLabel,
      url: tab.url || "",
      favIconUrl: tab.favIconUrl || "",
      windowId: tab.windowId ?? -1,
      lastOpenedAt: tab.lastAccessed,
      active: tab.active,
    };
  }

  return {
    isAvailable() {
      return !!getApi();
    },

    apiMethodNames() {
      const zenTabs = getApi();
      return zenTabs ? Object.keys(zenTabs) : [];
    },

    resolveAnchorTabId: resolveAnchor,

    listTabs,
    getTab,

    async listSpaces(anchorTabId?: number) {
      const tabId = await resolveAnchor(anchorTabId);
      const zenTabs = getApi();
      if (!zenTabs?.getSpaces) {
        debugWarn(`${LOG_PREFIX} getSpaces unavailable`, {
          hasApi: !!zenTabs?.getSpaces,
          tabId,
        });
        return [];
      }

      try {
        const spaces = await zenTabs.getSpaces(zenAnchorTabId(tabId));
        debugLog(`${LOG_PREFIX} getSpaces returned`, { count: spaces.length });
        return spaces;
      } catch (error) {
        console.error(`${LOG_PREFIX} Could not read Zen spaces:`, formatError(error));
        await logDebugInfo?.("getSpaces", tabId);
        return [];
      }
    },

    getCustomLabels,

    async activateTab(tabId?: number, domId?: string, anchorTabId?: number) {
      const anchorId = zenAnchorTabId(await resolveAnchor(anchorTabId));
      const zenTabs = getApi();

      if (zenTabs?.activateTabByDomId && domId) {
        try {
          const activated = await zenTabs.activateTabByDomId(domId, anchorId);
          if (activated) {
            return;
          }
        } catch (error) {
          debugWarn(`${LOG_PREFIX} Zen DOM tab activation failed:`, formatError(error));
        }
      }

      if (zenTabs?.activateTab && isUsableTabId(tabId)) {
        try {
          const activated = await zenTabs.activateTab(tabId, anchorId);
          if (activated) {
            return;
          }
        } catch (error) {
          debugWarn(`${LOG_PREFIX} Zen tab activation failed:`, formatError(error));
        }
      }

      if (!isUsableTabId(tabId)) {
        throw new Error("Tab not found");
      }

      const tab = await host.getTab(tabId);
      if (!tab || !Number.isInteger(tab.windowId) || tab.windowId === undefined) {
        throw new Error("Tab or window not found");
      }

      await host.focusWindow(tab.windowId);
      await host.activateTab(tabId);
    },

    async switchSpace(spaceId: string, anchorTabId?: number) {
      const anchorId = zenAnchorTabId(await resolveAnchor(anchorTabId));
      const zenTabs = getApi();
      if (!zenTabs?.switchSpace) {
        throw new Error("Zen spaces API unavailable");
      }

      const switched = await zenTabs.switchSpace(spaceId, anchorId);
      if (!switched) {
        throw new Error("Could not switch space");
      }
    },

    async setLabel(label: string, anchorTabId?: number, silent?: boolean) {
      const zenTabs = getApi();
      if (!zenTabs?.setLabel) {
        return false;
      }
      return zenTabs.setLabel(label, zenAnchorTabId(anchorTabId), silent);
    },

    async changeLabel(anchorTabId?: number) {
      const zenTabs = getApi();
      if (!zenTabs?.changeLabel) {
        return false;
      }
      return zenTabs.changeLabel(zenAnchorTabId(anchorTabId));
    },

    async getDebugInfo(anchorTabId?: number) {
      const tabId = await resolveAnchor(anchorTabId);
      return (await getApi()?.getDebugInfo?.(tabId)) ?? { error: "zenTabs API unavailable" };
    },
  };
}
