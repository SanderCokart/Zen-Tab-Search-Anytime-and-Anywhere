import { debugWarn } from "../../debug";
import { formatError, LOG_PREFIX } from "../log";
import { resolveAnchorTabId, zenAnchorTabId } from "../zen/anchor";
import { getZenTabsApi } from "../zen/api";

export async function switchToTab(
  tabId?: number,
  domId?: string,
  anchorTabId?: number,
): Promise<void> {
  const anchorId = zenAnchorTabId(await resolveAnchorTabId(anchorTabId));
  const zenTabs = getZenTabsApi();

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

  if (zenTabs?.activateTab && Number.isInteger(tabId) && tabId! >= 0) {
    try {
      const activated = await zenTabs.activateTab(tabId!, anchorId);
      if (activated) {
        return;
      }
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Zen tab activation failed:`, formatError(error));
    }
  }

  if (!Number.isInteger(tabId) || tabId! < 0) {
    throw new Error("Tab not found");
  }

  const tab = await browser.tabs.get(tabId!);
  if (!tab || !Number.isInteger(tab.windowId)) {
    throw new Error("Tab or window not found");
  }

  await browser.windows.update(tab.windowId, { focused: true });
  await browser.tabs.update(tabId!, { active: true });
}

export async function switchToSpace(spaceId: string, anchorTabId?: number): Promise<void> {
  const anchorId = zenAnchorTabId(await resolveAnchorTabId(anchorTabId));
  const zenTabs = getZenTabsApi();
  if (!zenTabs?.switchSpace) {
    throw new Error("Zen spaces API unavailable");
  }

  const switched = await zenTabs.switchSpace(spaceId, anchorId);
  if (!switched) {
    throw new Error("Could not switch space");
  }
}
