import { debugLog, debugWarn } from "@/shared/debug";
import {
  buildForgeLabel,
  parseForgeUrl,
  type ForgePageInfo,
} from "@/features/forge/model/forge-label";
import { sendTabMessage } from "@/shared/messaging/client";
import { isUsableTabId, type TabInfo } from "@/shared/types";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { isContentScriptInjectableUrl } from "@/shared/urls";
import type { WorkspaceAdapter } from "@/features/zen/adapter";

async function getForgePageInfo(tabId?: number, url?: string): Promise<ForgePageInfo> {
  if (!isUsableTabId(tabId) || !isContentScriptInjectableUrl(url)) {
    return {};
  }

  try {
    return await sendTabMessage(tabId, { type: "getForgePageInfo" });
  } catch (error) {
    debugLog(`${LOG_PREFIX} getForgePageInfo unavailable:`, formatError(error));
  }

  return {};
}

async function applyForgeLabel(
  workspace: WorkspaceAdapter,
  tab: TabInfo,
  silent: boolean,
): Promise<boolean> {
  const url = tab.url || "";
  if (!isUsableTabId(tab.id) || !parseForgeUrl(url)) {
    return false;
  }

  const pageInfo = await getForgePageInfo(tab.id, url);
  const label = buildForgeLabel(url, tab.title || "", pageInfo);
  if (!label) {
    return false;
  }

  const set = await workspace.setLabel(label, tab.id, silent);
  if (set) {
    debugLog(`${LOG_PREFIX} change-tab-label: auto-set forge label`, {
      label,
      url,
      tabId: tab.id,
    });
  }
  return set;
}

function editorTabId(tabs: TabInfo[]): number | undefined {
  const active = tabs.find((tab) => tab.active);
  if (isUsableTabId(active?.id)) {
    return active.id;
  }
  const first = tabs[0];
  return isUsableTabId(first?.id) ? first.id : undefined;
}

export async function changeSelectedTabLabel(
  workspace: WorkspaceAdapter,
  preferredTabId?: number,
): Promise<void> {
  if (!workspace.isAvailable()) {
    console.error(`${LOG_PREFIX} change-tab-label: zenTabs API unavailable`);
    return;
  }

  const selected = (await workspace.listSelectedTabs(preferredTabId)).filter((tab) =>
    isUsableTabId(tab.id),
  );
  const bulk = selected.length > 1;
  let applied = 0;

  for (const tab of selected) {
    if (await applyForgeLabel(workspace, tab, bulk)) {
      applied += 1;
    }
  }

  if (bulk && applied > 0) {
    return;
  }

  const tabId = editorTabId(selected) ?? (await workspace.resolveAnchorTabId(preferredTabId));
  const changed = await workspace.changeLabel(tabId);
  if (!changed) {
    debugWarn(
      `${LOG_PREFIX} change-tab-label: Zen did not start renaming (sidebar collapsed, essentials, or API unavailable)`,
    );
  }
}
