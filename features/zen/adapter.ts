import { debugLog, debugWarn } from "@/shared/debug";
import { isUsableTabId, type SpaceInfo, type TabInfo } from "@/shared/types";
import { formatError, LOG_PREFIX } from "@/shared/log";
import {
  isUsableWindowId,
  resolveAnchorTabId as resolveBrowserAnchorTabId,
  zenAnchorTabId,
} from "@/features/zen/anchor";
import { getZenTabsApi, type ZenTabsApi } from "@/features/zen/api";
import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";

export interface BrowserTabSnapshot {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  windowId?: number;
  active?: boolean;
  lastAccessed?: number;
}

export type TabQueryInfo = {
  highlighted?: boolean;
  lastFocusedWindow?: boolean;
  currentWindow?: boolean;
  active?: boolean;
  windowId?: number;
};

export interface WorkspaceBrowserHost {
  queryTabs(queryInfo?: TabQueryInfo): Promise<BrowserTabSnapshot[]>;
  getTab(tabId: number): Promise<BrowserTabSnapshot>;
  focusWindow(windowId: number): Promise<void>;
  activateTab(tabId: number): Promise<void>;
  createTab(options: {
    url: string;
    active: boolean;
    pinned: boolean;
  }): Promise<BrowserTabSnapshot>;
  removeTab(tabId: number | number[]): Promise<void>;
}

export interface WorkspaceAdapter {
  isAvailable(): boolean;
  apiMethodNames(): string[];
  resolveAnchorTabId(preferredTabId?: number): Promise<number | undefined>;
  listTabs(anchorTabId?: number): Promise<TabInfo[]>;
  listSelectedTabs(anchorTabId?: number): Promise<TabInfo[]>;
  getTab(tabId: number): Promise<TabInfo>;
  listSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
  getCustomLabels(tabIds: number[]): Promise<Record<number, string>>;
  activateTab(tabId?: number, domId?: string, anchorTabId?: number): Promise<void>;
  switchSpace(spaceId: string, anchorTabId?: number): Promise<void>;
  setLabel(label: string, anchorTabId?: number, silent?: boolean): Promise<boolean>;
  changeLabel(anchorTabId?: number): Promise<boolean>;
  getDebugInfo(anchorTabId?: number): Promise<unknown>;
  listFolders(anchorTabId?: number): Promise<ZenFolderInfo[]>;
  createFolder(
    name: string,
    spaceId: string | undefined,
    tabIds: number[],
    parentId?: string,
    anchorTabId?: number,
  ): Promise<string>;
  renameFolder(folderId: string, name: string): Promise<void>;
  moveTabsToFolder(tabIds: number[], folderId: string): Promise<number>;
  removeTabsFromFolder(tabIds: number[]): Promise<number>;
  moveTabsToSpace(tabIds: number[], spaceId: string): Promise<number>;
  moveTab(
    tabId: number,
    placement: { beforeTabId: number } | { afterTabId: number },
  ): Promise<void>;
  /** Opens a background tab in the current window's active space and returns its ID. */
  openTab(url: string, options: { pinned: boolean }): Promise<number>;
  closeTab(tabId: number): Promise<void>;
  closeTabs(tabIds: number[]): Promise<void>;
  createSpace(name: string, anchorTabId?: number): Promise<string>;
  renameSpace(spaceId: string, name: string): Promise<void>;
  moveFolder(
    folderId: string,
    placement: { spaceId?: string; parentId?: string; afterFolderId?: string },
  ): Promise<void>;
  deleteFolders(folderIds: string[]): Promise<void>;
  deleteSpaces(spaceIds: string[], anchorTabId?: number): Promise<void>;
  setEssential(tabIds: number[]): Promise<void>;
  clearEssential(tabIds: number[]): Promise<void>;
}

export interface ZenWorkspaceAdapterOptions {
  getZenTabsApi?: () =>
    | (Partial<Omit<ZenTabsApi, "getDebugInfo">> & {
        getDebugInfo?: (anchorTabId?: number) => Promise<unknown>;
      })
    | undefined;
  resolveAnchorTabId?: (preferredTabId?: number) => Promise<number | undefined>;
  /** Overrides for individual host methods; the rest use `browser.*`. */
  browser?: Partial<WorkspaceBrowserHost>;
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
    createTab: (options) => browser.tabs.create(options),
    removeTab: async (tabId) => {
      if (Array.isArray(tabId)) {
        await browser.tabs.remove(tabId);
        return;
      }
      await browser.tabs.remove(tabId);
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
  const host: WorkspaceBrowserHost = { ...defaultBrowserHost(), ...options.browser };
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

  async function enrichZenTabs(tabs: TabInfo[], anchorTabId?: number): Promise<TabInfo[]> {
    const focusedTabId = await resolveAnchor(anchorTabId);
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
        active:
          focusedTabId !== undefined
            ? candidateTabId >= 0 && candidateTabId === focusedTabId
            : tab.active === true || browserTab?.active === true,
      };
    });
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
      return enrichZenTabs(tabs, tabId);
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not read tabs across Zen spaces:`, formatError(error));
      await logDebugInfo?.("queryTabs getAllTabs", tabId);
      return undefined;
    }
  }

  async function listSelectedTabsFromZen(tabId?: number): Promise<TabInfo[] | undefined> {
    const zenTabs = getApi();
    if (!zenTabs?.getSelectedTabs) {
      return undefined;
    }

    try {
      debugLog(`${LOG_PREFIX} listSelectedTabs via zenTabs.getSelectedTabs`, {
        anchorTabId: tabId,
      });
      const tabs = await zenTabs.getSelectedTabs(zenAnchorTabId(tabId));
      if (!tabs?.length) {
        return undefined;
      }
      return enrichZenTabs(tabs, tabId);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not read selected Zen tabs:`, formatError(error));
      await logDebugInfo?.("listSelectedTabs getSelectedTabs", tabId);
      return undefined;
    }
  }

  async function queryInfoForAnchorWindow(anchorTabId?: number): Promise<TabQueryInfo> {
    if (!isUsableTabId(anchorTabId)) {
      return {};
    }
    try {
      const tab = await host.getTab(anchorTabId);
      if (isUsableWindowId(tab.windowId)) {
        return { windowId: tab.windowId };
      }
    } catch {
      // Anchor tab may already be gone.
    }
    return {};
  }

  async function listSelectedTabsFromBrowser(anchorTabId?: number): Promise<TabInfo[]> {
    const windowQuery = await queryInfoForAnchorWindow(anchorTabId);
    const queries: TabQueryInfo[] = [];
    if (isUsableWindowId(windowQuery.windowId)) {
      queries.push({ highlighted: true, windowId: windowQuery.windowId });
    }
    queries.push(
      { highlighted: true, lastFocusedWindow: true },
      { highlighted: true, currentWindow: true },
    );

    for (const query of queries) {
      try {
        const browserTabs = await host.queryTabs(query);
        const tabIds = browserTabs
          .map((tab) => tab.id)
          .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id >= 0);
        if (tabIds.length === 0) {
          continue;
        }
        const customLabels = await getCustomLabels(tabIds);
        const focusedTabId = await resolveAnchor(anchorTabId);
        return mapBrowserTabs(browserTabs, customLabels, focusedTabId);
      } catch {
        // Try the next highlighted-tab query.
      }
    }

    const tabId = await resolveAnchor(anchorTabId);
    if (!isUsableTabId(tabId)) {
      return [];
    }

    try {
      const tab = await host.getTab(tabId);
      const labels = await getCustomLabels([tabId]);
      return mapBrowserTabs([tab], labels, tabId);
    } catch {
      return [];
    }
  }

  async function listTabs(anchorTabId?: number): Promise<TabInfo[]> {
    const tabId = await resolveAnchor(anchorTabId);
    const zenTabs = await listTabsFromZen(tabId);
    if (zenTabs) {
      return zenTabs;
    }

    const browserTabs = await host.queryTabs(await queryInfoForAnchorWindow(tabId));
    const tabIds = browserTabs
      .map((tab) => tab.id)
      .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id >= 0);
    const customLabels = await getCustomLabels(tabIds);
    const focusedTabId = await resolveAnchor(tabId);
    return mapBrowserTabs(browserTabs, customLabels, focusedTabId);
  }

  async function listSelectedTabs(anchorTabId?: number): Promise<TabInfo[]> {
    const tabId = await resolveAnchor(anchorTabId);
    const zenTabs = await listSelectedTabsFromZen(tabId);
    if (zenTabs) {
      return zenTabs;
    }
    return listSelectedTabsFromBrowser(tabId);
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
    listSelectedTabs,
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
      const anchorId = zenAnchorTabId(await resolveAnchor(anchorTabId ?? tabId));
      const zenTabs = getApi();

      // Extension tab IDs are unique across windows. DOM ids are not, so a
      // shared `tab-1` in another instance must not win when we have a real id.
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

    async listFolders(anchorTabId?: number) {
      const zenTabs = getApi();
      if (!zenTabs?.listFolders) {
        throw new Error("Zen folders API unavailable");
      }
      return zenTabs.listFolders(zenAnchorTabId(await resolveAnchor(anchorTabId)));
    },

    async createFolder(name, spaceId, tabIds, parentId, anchorTabId) {
      const zenTabs = getApi();
      if (!zenTabs?.createFolder) {
        throw new Error("Zen folders API unavailable");
      }
      return zenTabs.createFolder(
        name,
        spaceId ?? "",
        tabIds,
        parentId ?? "",
        zenAnchorTabId(await resolveAnchor(anchorTabId)),
      );
    },

    async renameFolder(folderId, name) {
      const zenTabs = getApi();
      if (!zenTabs?.renameFolder) {
        throw new Error("Zen folders API unavailable");
      }
      await zenTabs.renameFolder(folderId, name);
    },

    async moveTabsToFolder(tabIds, folderId) {
      const zenTabs = getApi();
      if (!zenTabs?.moveTabsToFolder) {
        throw new Error("Zen folders API unavailable");
      }
      return zenTabs.moveTabsToFolder(tabIds, folderId);
    },

    async removeTabsFromFolder(tabIds) {
      const zenTabs = getApi();
      if (!zenTabs?.removeTabsFromFolder) {
        throw new Error("Zen folders API unavailable");
      }
      return zenTabs.removeTabsFromFolder(tabIds);
    },

    async moveTabsToSpace(tabIds, spaceId) {
      const zenTabs = getApi();
      if (!zenTabs?.moveTabsToSpace) {
        throw new Error("Zen spaces API unavailable");
      }
      return zenTabs.moveTabsToSpace(tabIds, spaceId);
    },

    async openTab(url, { pinned }) {
      const tab = await host.createTab({ url, active: false, pinned });
      if (!isUsableTabId(tab.id)) {
        throw new Error("Zen did not return an ID for the new tab");
      }
      return tab.id;
    },

    async closeTab(tabId) {
      await host.removeTab(tabId);
    },

    async closeTabs(tabIds) {
      await host.removeTab(tabIds);
    },

    async moveTab(tabId, placement) {
      const zenTabs = getApi();
      if (!zenTabs?.moveTab) {
        throw new Error("Zen tab move API unavailable");
      }
      const moved =
        "beforeTabId" in placement
          ? await zenTabs.moveTab(tabId, placement.beforeTabId)
          : await zenTabs.moveTab(tabId, undefined, placement.afterTabId);
      if (!moved) {
        throw new Error("Could not move tab");
      }
    },

    async createSpace(name, anchorTabId) {
      const zenTabs = getApi();
      if (!zenTabs?.createSpace) {
        throw new Error("Zen spaces API unavailable");
      }
      return zenTabs.createSpace(name, zenAnchorTabId(await resolveAnchor(anchorTabId)));
    },

    async renameSpace(spaceId, name) {
      const zenTabs = getApi();
      if (!zenTabs?.renameSpace) {
        throw new Error("Zen spaces API unavailable");
      }
      await zenTabs.renameSpace(spaceId, name);
    },

    async moveFolder(folderId, placement) {
      const zenTabs = getApi();
      if (!zenTabs?.moveFolder) {
        throw new Error("Zen folders API unavailable");
      }
      const moved = await zenTabs.moveFolder(
        folderId,
        placement.spaceId ?? "",
        placement.parentId ?? "",
        placement.afterFolderId ?? "",
      );
      if (!moved) {
        throw new Error("Could not move folder");
      }
    },

    async deleteFolders(folderIds) {
      const zenTabs = getApi();
      if (!zenTabs?.deleteFolder) {
        throw new Error("Zen folders API unavailable");
      }
      await zenTabs.deleteFolder(folderIds);
    },

    async deleteSpaces(spaceIds, anchorTabId) {
      const zenTabs = getApi();
      if (!zenTabs?.deleteSpace) {
        throw new Error("Zen spaces API unavailable");
      }
      await zenTabs.deleteSpace(spaceIds, zenAnchorTabId(await resolveAnchor(anchorTabId)));
    },

    async setEssential(tabIds) {
      const zenTabs = getApi();
      if (!zenTabs?.setEssential) {
        throw new Error("Zen essentials API unavailable");
      }
      const marked = await zenTabs.setEssential(tabIds);
      if (!marked) {
        throw new Error("One or more tabs cannot be made essential.");
      }
    },

    async clearEssential(tabIds) {
      const zenTabs = getApi();
      if (!zenTabs?.clearEssential) {
        throw new Error("Zen essentials API unavailable");
      }
      await zenTabs.clearEssential(tabIds);
    },
  };
}
