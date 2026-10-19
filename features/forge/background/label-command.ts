import { debugLog, debugWarn } from "@/shared/debug";
import {
  buildForgeLabel,
  parseForgeUrl,
  type ForgePageInfo,
  type ForgePlatform,
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

/**
 * Sets a GitHub/GitLab tab's label from its issue, MR or PR. Always silent: the
 * rename editor opens right after, and Zen's "renamed" toast at that moment can
 * take focus from the editor's input and end the rename before it starts.
 */
async function applyForgeLabel(workspace: WorkspaceAdapter, tab: TabInfo): Promise<boolean> {
  const url = tab.url || "";
  if (!isUsableTabId(tab.id) || !parseForgeUrl(url)) {
    return false;
  }

  const pageInfo = await getForgePageInfo(tab.id, url);
  const label = buildForgeLabel(url, tab.title || "", pageInfo);
  if (!label) {
    return false;
  }

  const set = await workspace.setLabel(label, tab.id, true);
  if (set) {
    debugLog(`${LOG_PREFIX} change-tab-label: auto-set forge label`, {
      label,
      url,
      tabId: tab.id,
    });
  }
  return set;
}

export interface ForgeDetection {
  tabId: number;
  url: string;
  label: string;
  platform: ForgePlatform;
  applied: boolean;
}

/**
 * Labels every GitHub/GitLab tab in `tabs` in one pass, the bulk counterpart
 * of the per-tab rename. With `dryRun` nothing is renamed and `applied` is false.
 */
export async function detectForgeLabels(
  workspace: Pick<WorkspaceAdapter, "setLabel">,
  tabs: TabInfo[],
  { dryRun }: { dryRun: boolean },
): Promise<ForgeDetection[]> {
  const detections: ForgeDetection[] = [];

  for (const tab of tabs) {
    const url = tab.url || "";
    const ref = isUsableTabId(tab.id) ? parseForgeUrl(url) : null;
    if (!isUsableTabId(tab.id) || !ref) {
      continue;
    }

    const pageInfo = await getForgePageInfo(tab.id, url);
    const label = buildForgeLabel(url, tab.title || "", pageInfo);
    if (!label) {
      continue;
    }

    const applied = dryRun ? false : await workspace.setLabel(label, tab.id, true);
    detections.push({ tabId: tab.id, url, label, platform: ref.platform, applied });
  }

  return detections;
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

  const listed = await workspace.listSelectedTabs(preferredTabId);
  const selected = listed.filter((tab) => isUsableTabId(tab.id));
  debugLog(`${LOG_PREFIX} change-tab-label: selection`, {
    preferredTabId,
    listed: listed.map((tab) => ({
      id: tab.id,
      domId: tab.domId,
      active: tab.active,
      essential: tab.essential,
      url: tab.url,
    })),
    usable: selected.map((tab) => tab.id),
  });
  const labelled = new Set<number>();

  for (const tab of selected) {
    if (isUsableTabId(tab.id) && (await applyForgeLabel(workspace, tab))) {
      labelled.add(tab.id);
    }
  }

  // With several tabs selected the shortcut is a bulk auto-label only: there is
  // no single tab to edit by hand. One tab gets its label (if any) and the editor.
  if (selected.length > 1) {
    debugLog(`${LOG_PREFIX} change-tab-label: ${selected.length} tabs selected, auto-label only`, {
      labelled: [...labelled],
    });
    return;
  }

  const editorId = editorTabId(selected);
  const tabId = editorId ?? (await workspace.resolveAnchorTabId(preferredTabId));
  // An automatic label is usually kept and extended, so the caret goes to its
  // start; a label typed by hand is usually replaced, so all of it is selected.
  const selection = tabId !== undefined && labelled.has(tabId) ? "start" : "all";
  debugLog(`${LOG_PREFIX} change-tab-label: opening Zen's rename editor`, {
    labelled: [...labelled],
    editorTabId: editorId,
    anchorTabId: editorId === undefined ? tabId : undefined,
    selection,
  });
  const changed = await workspace.changeLabel(tabId, selection);
  debugLog(`${LOG_PREFIX} change-tab-label: Zen editor started: ${changed}`);
  if (!changed) {
    debugWarn(
      `${LOG_PREFIX} change-tab-label: Zen did not start renaming (sidebar collapsed, essentials, or API unavailable)`,
    );
  }
}
