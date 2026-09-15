import { debugLog, debugWarn } from "../../debug";
import { buildForgeLabel, parseForgeUrl, type ForgePageInfo } from "../../forge-label";
import { sendTabMessage } from "../../messaging/client";
import { formatError, LOG_PREFIX } from "../log";
import { isContentScriptInjectableUrl } from "../urls";
import type { WorkspaceAdapter } from "../zen/adapter";

async function getForgePageInfo(tabId?: number, url?: string): Promise<ForgePageInfo> {
  if (!Number.isInteger(tabId) || tabId! < 0 || !isContentScriptInjectableUrl(url)) {
    return {};
  }

  try {
    return await sendTabMessage(tabId!, { type: "getForgePageInfo" });
  } catch (error) {
    debugLog(`${LOG_PREFIX} getForgePageInfo unavailable:`, formatError(error));
  }

  return {};
}

export async function changeSelectedTabLabel(workspace: WorkspaceAdapter): Promise<void> {
  if (!workspace.isAvailable()) {
    console.error(`${LOG_PREFIX} change-tab-label: zenTabs API unavailable`);
    return;
  }

  const tabId = await workspace.resolveAnchorTabId();
  const tab = Number.isInteger(tabId) && tabId! >= 0 ? await browser.tabs.get(tabId!) : undefined;
  const url = tab?.url || "";

  if (parseForgeUrl(url)) {
    const pageInfo = await getForgePageInfo(tabId, url);
    const label = buildForgeLabel(url, tab?.title || "", pageInfo);
    if (label) {
      const set = await workspace.setLabel(label, tabId);
      if (set) {
        debugLog(`${LOG_PREFIX} change-tab-label: auto-set forge label`, { label, url });
        const editorOpened = await workspace.changeLabel(tabId);
        if (!editorOpened) {
          debugWarn(`${LOG_PREFIX} change-tab-label: could not open Zen label editor`);
        }
        return;
      }
    }
  }

  const changed = await workspace.changeLabel(tabId);
  if (!changed) {
    debugWarn(
      `${LOG_PREFIX} change-tab-label: Zen did not start renaming (sidebar collapsed, essentials, or API unavailable)`,
    );
  }
}
