import { DEBUG, debugError, debugLog, debugWarn } from "../lib/debug";
import type { SpaceInfo, TabInfo } from "../lib/types";

interface ZenDebugInfo {
  timestamp: string;
  anchorTabId: number;
  servicesSource: string;
  servicesImport: string;
  windowSource: string;
  tabManagerWindowCount: number;
  windowFound: boolean;
  hasGZenWorkspaces: boolean;
  hasGBrowser: boolean;
  hasPromiseInitialized: boolean;
  workspaceEnabled: boolean | null;
  workspaceCount: number;
  activeWorkspace: string;
  storedTabCount: number;
  domTabCount: number;
  errors: string[];
}

interface ZenTabsApi {
  getDebugInfo(anchorTabId?: number): Promise<ZenDebugInfo>;
  getCustomLabels(tabIds?: number[]): Promise<Record<number, string>>;
  getSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
  getAllTabs(anchorTabId?: number): Promise<TabInfo[] | null>;
  switchSpace(spaceId: string, anchorTabId?: number): Promise<boolean>;
  activateTab(tabId: number, anchorTabId?: number): Promise<boolean>;
  activateTabByDomId(domId: string, anchorTabId?: number): Promise<boolean>;
}

const LOG_PREFIX = "[zen-tab-search]";

function getZenTabsApi(): ZenTabsApi | undefined {
  return (browser as typeof browser & { zenTabs?: ZenTabsApi }).zenTabs;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function isContentScriptInjectableUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  } catch {
    return false;
  }
}

/** Zen experiment APIs accept -1 when no extension tab can anchor the browser window lookup. */
function zenAnchorTabId(tabId?: number): number {
  if (Number.isInteger(tabId) && tabId! >= 0) {
    return tabId!;
  }
  return -1;
}

async function resolveAnchorTabId(preferredTabId?: number): Promise<number | undefined> {
  if (Number.isInteger(preferredTabId) && preferredTabId! >= 0) {
    return preferredTabId;
  }

  const focusedTabs = await browser.tabs.query({ active: true, currentWindow: true });
  const focusedTabId = focusedTabs[0]?.id;
  if (Number.isInteger(focusedTabId) && focusedTabId! >= 0) {
    return focusedTabId;
  }

  const activeTabs = await browser.tabs.query({ active: true });
  const activeTabId = activeTabs[0]?.id;
  if (Number.isInteger(activeTabId) && activeTabId! >= 0) {
    return activeTabId;
  }

  const allTabs = await browser.tabs.query({});
  const anyTabId = allTabs[0]?.id;
  if (Number.isInteger(anyTabId) && anyTabId! >= 0) {
    return anyTabId;
  }

  return undefined;
}

let fallbackPopupWindowId: number | undefined;

async function closeSearchPopup(): Promise<boolean> {
  let closed = false;

  for (const view of browser.extension.getViews({ type: "popup" })) {
    view.close();
    closed = true;
  }

  if (Number.isInteger(fallbackPopupWindowId)) {
    try {
      await browser.windows.remove(fallbackPopupWindowId!);
      closed = true;
    } catch {
      // Window was already closed.
    }
    fallbackPopupWindowId = undefined;
  }

  return closed;
}

async function openSearchPopup(): Promise<void> {
  try {
    await browser.browserAction.openPopup();
    return;
  } catch (error) {
    debugWarn(
      `${LOG_PREFIX} browserAction.openPopup failed, trying popup window:`,
      formatError(error),
    );
  }

  try {
    const window = await browser.windows.create({
      url: browser.runtime.getURL("popup.html"),
      type: "popup",
      width: 400,
      height: 480,
    });
    if (Number.isInteger(window.id)) {
      fallbackPopupWindowId = window.id;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not open search popup:`, formatError(error));
  }
}

async function toggleSearchPopup(): Promise<void> {
  if (await closeSearchPopup()) {
    return;
  }

  await openSearchPopup();
}

async function toggleOmnibar(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const tabId = tab?.id;

  if (Number.isInteger(tabId) && tabId! >= 0 && isContentScriptInjectableUrl(tab?.url)) {
    try {
      await browser.tabs.sendMessage(tabId!, { type: "toggleOmnibar", anchorTabId: tabId });
      return;
    } catch (error) {
      debugLog(
        `${LOG_PREFIX} In-page omnibar unavailable, falling back to popup:`,
        formatError(error),
      );
    }
  }

  await toggleSearchPopup();
}

async function logZenDebugInfo(context: string, anchorTabId?: number): Promise<void> {
  if (!DEBUG) {
    return;
  }

  const zenTabs = getZenTabsApi();
  if (!zenTabs?.getDebugInfo) {
    debugWarn(`${LOG_PREFIX} ${context}: zenTabs.getDebugInfo unavailable`);
    return;
  }

  const tabId = await resolveAnchorTabId(anchorTabId);
  try {
    const info = await zenTabs.getDebugInfo(tabId);
    debugWarn(`${LOG_PREFIX} ${context} debug info:`, info);
  } catch (error) {
    debugWarn(`${LOG_PREFIX} ${context}: getDebugInfo failed:`, formatError(error));
  }
}

async function warmUpZenTabsApi(): Promise<void> {
  if (!DEBUG) {
    return;
  }

  const zenTabs = getZenTabsApi();
  if (!zenTabs) {
    debugWarn(
      `${LOG_PREFIX} warmUp: browser.zenTabs unavailable — Zen Browser experiment API required`,
    );
    debugWarn(
      `${LOG_PREFIX} Set extensions.experiments.enabled=true in about:config and restart Zen`,
    );
    return;
  }

  const anchorTabId = await resolveAnchorTabId();
  debugLog(`${LOG_PREFIX} warmUp: zenTabs available`, {
    methods: Object.keys(zenTabs),
    anchorTabId,
  });

  if (!Number.isInteger(anchorTabId)) {
    debugWarn(`${LOG_PREFIX} warmUp: no active tab yet — Zen APIs need an open browser tab`);
    return;
  }

  try {
    const info = await zenTabs.getDebugInfo(anchorTabId);
    debugLog(`${LOG_PREFIX} warmUp debug info:`, info);
  } catch (error) {
    debugError(`${LOG_PREFIX} warmUp getDebugInfo failed:`, formatError(error));
  }

  try {
    const spaces = await zenTabs.getSpaces(anchorTabId);
    debugLog(`${LOG_PREFIX} warmUp getSpaces:`, { count: spaces.length, spaces });
  } catch (error) {
    debugError(`${LOG_PREFIX} warmUp getSpaces failed:`, formatError(error));
    await logZenDebugInfo("warmUp getSpaces", anchorTabId);
  }
}

async function getCustomTabLabels(tabIds: number[]): Promise<Record<number, string>> {
  const zenTabs = getZenTabsApi();
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

async function queryTabs(anchorTabId?: number): Promise<TabInfo[]> {
  const tabId = await resolveAnchorTabId(anchorTabId);
  const zenTabs = getZenTabsApi();

  if (zenTabs?.getAllTabs) {
    try {
      debugLog(`${LOG_PREFIX} queryTabs via zenTabs.getAllTabs`, { anchorTabId: tabId });
      const tabs = await zenTabs.getAllTabs(zenAnchorTabId(tabId));
      if (tabs) {
        return tabs.map((tab) => ({
          ...tab,
          id: tab.id >= 0 ? tab.id : -1,
        }));
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not read tabs across Zen spaces:`, formatError(error));
      await logZenDebugInfo("queryTabs getAllTabs", tabId);
    }
  }

  const tabs = await browser.tabs.query({});
  const tabIds = tabs
    .map((tab) => tab.id)
    .filter((id): id is number => Number.isInteger(id) && id >= 0);
  const customLabels = await getCustomTabLabels(tabIds);

  return tabs.map((tab) => ({
    id: tab.id!,
    title: tab.title || "Untitled",
    customLabel: customLabels[tab.id ?? -1] ?? "",
    url: tab.url || "",
    favIconUrl: tab.favIconUrl || "",
    windowId: tab.windowId,
  }));
}

async function getSpaces(anchorTabId?: number): Promise<SpaceInfo[]> {
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

async function switchToTab(tabId?: number, domId?: string, anchorTabId?: number): Promise<void> {
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

async function switchToSpace(spaceId: string, anchorTabId?: number): Promise<void> {
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

export default defineBackground(() => {
  debugLog(`${LOG_PREFIX} background started at`, new Date().toISOString());

  if (DEBUG) {
    browser.tabs.onActivated.addListener(() => {
      void warmUpZenTabsApi();
    });
    void warmUpZenTabsApi();
  }

  browser.windows.onRemoved.addListener((windowId) => {
    if (windowId === fallbackPopupWindowId) {
      fallbackPopupWindowId = undefined;
    }
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === "show-omnibar") {
      void toggleOmnibar().catch((error) => {
        console.error(`${LOG_PREFIX} Error handling show-omnibar command:`, formatError(error));
      });
      return;
    }

    if (command === "toggle-popup") {
      void toggleSearchPopup().catch((error) => {
        console.error(`${LOG_PREFIX} Error handling toggle-popup command:`, formatError(error));
      });
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const anchorTabId = Number.isInteger(message.anchorTabId)
      ? message.anchorTabId
      : sender.tab?.id;

    if (message.type === "getTabs") {
      queryTabs(anchorTabId)
        .then((tabs) => sendResponse(tabs))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    if (message.type === "getSpaces") {
      getSpaces(anchorTabId)
        .then((spaces) => sendResponse(spaces))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    if (message.type === "getDebugInfo") {
      resolveAnchorTabId(anchorTabId)
        .then((tabId) => getZenTabsApi()?.getDebugInfo(tabId))
        .then((info) => sendResponse(info ?? { error: "zenTabs API unavailable" }))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    if (message.type === "switchTab") {
      switchToTab(message.tabId, message.domId, anchorTabId)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    if (message.type === "switchSpace") {
      switchToSpace(message.spaceId, anchorTabId)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    return false;
  });
});
