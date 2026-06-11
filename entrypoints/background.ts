import { DEBUG, debugError, debugLog, debugWarn } from "../lib/debug";

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

interface TabInfo {
  id: number;
  domId?: string;
  title: string;
  customLabel?: string;
  url: string;
  favIconUrl: string;
  windowId: number;
  workspaceId?: string;
  workspaceName?: string;
}

interface SpaceInfo {
  id: string;
  name: string;
  icon?: string;
  isActive: boolean;
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

async function resolveAnchorTabId(preferredTabId?: number): Promise<number | undefined> {
  if (Number.isInteger(preferredTabId) && preferredTabId! >= 0) {
    return preferredTabId;
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (Number.isInteger(tabId) && tabId! >= 0) {
    return tabId;
  }

  return undefined;
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
    debugWarn(`${LOG_PREFIX} warmUp: browser.zenTabs unavailable — Zen Browser experiment API required`);
    debugWarn(`${LOG_PREFIX} Set extensions.experiments.enabled=true in about:config and restart Zen`);
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

  if (zenTabs?.getAllTabs && Number.isInteger(tabId)) {
    try {
      debugLog(`${LOG_PREFIX} queryTabs via zenTabs.getAllTabs`, { anchorTabId: tabId });
      const tabs = await zenTabs.getAllTabs(tabId);
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
  if (!zenTabs?.getSpaces || !Number.isInteger(tabId)) {
    debugWarn(`${LOG_PREFIX} getSpaces unavailable`, { hasApi: !!zenTabs?.getSpaces, tabId });
    return [];
  }

  try {
    const spaces = await zenTabs.getSpaces(tabId);
    debugLog(`${LOG_PREFIX} getSpaces returned`, { count: spaces.length });
    return spaces;
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not read Zen spaces:`, formatError(error));
    await logZenDebugInfo("getSpaces", tabId);
    return [];
  }
}

async function switchToTab(
  tabId?: number,
  domId?: string,
  anchorTabId?: number,
): Promise<void> {
  const anchorId = await resolveAnchorTabId(anchorTabId);
  const zenTabs = getZenTabsApi();

  if (zenTabs?.activateTabByDomId && domId && Number.isInteger(anchorId)) {
    try {
      const activated = await zenTabs.activateTabByDomId(domId, anchorId);
      if (activated) {
        return;
      }
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Zen DOM tab activation failed:`, formatError(error));
    }
  }

  if (zenTabs?.activateTab && Number.isInteger(tabId) && tabId! >= 0 && Number.isInteger(anchorId)) {
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
  const tabId = await resolveAnchorTabId(anchorTabId);
  const zenTabs = getZenTabsApi();
  if (!zenTabs?.switchSpace || !Number.isInteger(tabId)) {
    throw new Error("Zen spaces API unavailable");
  }

  const switched = await zenTabs.switchSpace(spaceId, tabId);
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

  browser.commands.onCommand.addListener((command) => {
    if (command !== "show-omnibar") {
      return;
    }

    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const tabId = tabs[0]?.id;
        if (!Number.isInteger(tabId) || tabId! < 0) {
          console.error(`${LOG_PREFIX} No valid active tab found`);
          return;
        }

        return browser.tabs.sendMessage(tabId!, { type: "showOmnibar", anchorTabId: tabId });
      })
      .catch((error) => {
        console.error(`${LOG_PREFIX} Error handling show-omnibar command:`, formatError(error));
      });
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
