import { findReusableTab, type ReusableTab } from "@/features/intercept/model/reuse-url";
import { readDisplaySettings } from "@/features/settings/model/display-settings";
import { getZenTabsApi } from "@/features/zen/api";
import { debugLog, debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { isUsableTabId } from "@/shared/types";

export interface ExternalTabReuseDeps {
  consumeExternalTab(tabId: number): Promise<string>;
  listTabs(anchorTabId?: number): Promise<ReusableTab[]>;
  activateTab(tabId?: number, domId?: string, anchorTabId?: number): Promise<void>;
  removeTab(tabId: number): Promise<void>;
  recordOpened?(tabId: number): Promise<void>;
  isEnabled(): Promise<boolean>;
}

function waitForClaim(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function reuseOpenedExternalTab(
  openedTabId: number,
  deps: ExternalTabReuseDeps,
  attempt = 0,
): Promise<void> {
  if (!isUsableTabId(openedTabId)) {
    return;
  }

  let url = "";
  try {
    url = (await deps.consumeExternalTab(openedTabId)) || "";
  } catch (error) {
    debugWarn(`${LOG_PREFIX} Could not read external tab open:`, formatError(error));
    return;
  }

  if (!url) {
    if (attempt === 0) {
      await waitForClaim();
      await reuseOpenedExternalTab(openedTabId, deps, attempt + 1);
    }
    return;
  }

  let enabled = false;
  try {
    enabled = await deps.isEnabled();
  } catch (error) {
    debugWarn(`${LOG_PREFIX} Could not read external tab reuse setting:`, formatError(error));
  }
  if (!enabled) {
    return;
  }

  try {
    const tabs = await deps.listTabs(openedTabId);
    const match = findReusableTab(tabs, openedTabId, url);
    if (!match) {
      return;
    }

    const tabId = isUsableTabId(match.id) ? match.id : undefined;
    await deps.activateTab(tabId, match.domId, openedTabId);
    await deps.removeTab(openedTabId);
    if (tabId !== undefined) {
      await deps.recordOpened?.(tabId);
    }
    debugLog(`${LOG_PREFIX} Focused an existing tab for an external URL`, {
      openedTabId,
      tabId: match.id,
      url,
    });
  } catch (error) {
    debugWarn(`${LOG_PREFIX} Could not reuse an existing tab:`, formatError(error));
  }
}

export function registerExternalTabReuse(
  deps: ExternalTabReuseDeps & {
    onCreated: {
      addListener(listener: (tab: { id?: number }) => void): void;
      removeListener(listener: (tab: { id?: number }) => void): void;
    };
  },
): () => void {
  // Touch the experiment API immediately so its addTab hook is installed
  // before the next external open.
  void deps.consumeExternalTab(-1).catch(() => undefined);

  const onCreated = (tab: { id?: number }) => {
    if (!isUsableTabId(tab.id)) {
      return;
    }
    const openedTabId = tab.id;
    // tabs.onCreated runs inside addTab, before the experiment records the claim.
    queueMicrotask(() => {
      void reuseOpenedExternalTab(openedTabId, deps);
    });
  };

  deps.onCreated.addListener(onCreated);
  return () => {
    deps.onCreated.removeListener(onCreated);
  };
}

export function registerBrowserExternalTabReuse(deps: {
  listTabs: ExternalTabReuseDeps["listTabs"];
  activateTab: ExternalTabReuseDeps["activateTab"];
  removeTab: ExternalTabReuseDeps["removeTab"];
  recordOpened?: ExternalTabReuseDeps["recordOpened"];
}): () => void {
  const api = getZenTabsApi();
  const consumeExternalTab = api?.consumeExternalTab?.bind(api);
  if (!consumeExternalTab) {
    debugLog(`${LOG_PREFIX} External tab reuse unavailable without zenTabs`);
    return () => {};
  }

  return registerExternalTabReuse({
    ...deps,
    consumeExternalTab,
    onCreated: browser.tabs.onCreated,
    isEnabled: async () => (await readDisplaySettings()).reuseExternalTabs,
  });
}
