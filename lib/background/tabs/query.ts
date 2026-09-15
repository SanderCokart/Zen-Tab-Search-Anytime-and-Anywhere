import { debugLog, debugWarn } from "../../debug";
import type { SpaceInfo, TabInfo } from "../../types";
import { formatError, LOG_PREFIX } from "../log";
import { resolveAnchorTabId, zenAnchorTabId } from "../zen/anchor";
import { getZenTabsApi } from "../zen/api";
import { logZenDebugInfo } from "../zen/debug";
import { getCustomTabLabels } from "../zen/labels";

export async function queryTabs(anchorTabId?: number): Promise<TabInfo[]> {
  const tabId = await resolveAnchorTabId(anchorTabId);
  const zenTabs = getZenTabsApi();

  if (zenTabs?.getAllTabs) {
    try {
      debugLog(`${LOG_PREFIX} queryTabs via zenTabs.getAllTabs`, { anchorTabId: tabId });
      const tabs = await zenTabs.getAllTabs(zenAnchorTabId(tabId));
      if (tabs) {
        const focusedTabId = await resolveAnchorTabId(tabId);
        return tabs.map((tab) => {
          const candidateTabId = tab.id;
          return {
            ...tab,
            id:
              typeof candidateTabId === "number" &&
              Number.isInteger(candidateTabId) &&
              candidateTabId >= 0
                ? candidateTabId
                : -1,
            active:
              typeof candidateTabId === "number" &&
              Number.isInteger(candidateTabId) &&
              candidateTabId === focusedTabId,
          };
        });
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not read tabs across Zen spaces:`, formatError(error));
      await logZenDebugInfo("queryTabs getAllTabs", tabId);
    }
  }

  const tabs = await browser.tabs.query({});
  const tabIds = tabs
    .map((tab) => tab.id)
    .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id >= 0);
  const customLabels = await getCustomTabLabels(tabIds);

  const focusedTabId = await resolveAnchorTabId(tabId);
  return tabs.map((tab) => ({
    id: tab.id!,
    title: tab.title || "Untitled",
    customLabel: customLabels[tab.id ?? -1] ?? "",
    url: tab.url || "",
    favIconUrl: tab.favIconUrl || "",
    windowId: tab.windowId,
    active: tab.id === focusedTabId,
  }));
}

export async function getTabInfo(tabId: number): Promise<TabInfo> {
  const tabs = await queryTabs(tabId);
  const match = tabs.find((tab) => tab.id === tabId);
  if (match) {
    return match;
  }

  const tab = await browser.tabs.get(tabId);
  const labels = await getCustomTabLabels([tabId]);
  return {
    id: tab.id ?? tabId,
    title: tab.title || "Untitled",
    customLabel: labels[tabId] ?? "",
    url: tab.url || "",
    favIconUrl: tab.favIconUrl || "",
    windowId: tab.windowId ?? -1,
    active: tab.active,
  };
}

export async function getSpaces(anchorTabId?: number): Promise<SpaceInfo[]> {
  const tabId = await resolveAnchorTabId(anchorTabId);
  const zenTabs = getZenTabsApi();
  if (!zenTabs?.getSpaces) {
    debugWarn(`${LOG_PREFIX} getSpaces unavailable`, { hasApi: !!zenTabs?.getSpaces, tabId });
    return [];
  }

  try {
    const spaces = await zenTabs.getSpaces(zenAnchorTabId(tabId));
    debugLog(`${LOG_PREFIX} getSpaces returned`, { count: spaces.length });
    return spaces;
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not read Zen spaces:`, formatError(error));
    await logZenDebugInfo("getSpaces", tabId);
    return [];
  }
}
