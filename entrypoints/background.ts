import { DEBUG, debugError, debugLog, debugWarn } from "../lib/debug";
import { buildForgeLabel, parseForgeUrl, type ForgePageInfo } from "../lib/forge-label";
import type { SpaceInfo, TabInfo, TabTimer } from "../lib/types";
import { composeTimerLabel, isAllowedTimerEnd, MAX_TIMER_MS, stripTimerPrefix } from "../lib/timer";

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
  changeLabel(anchorTabId?: number): Promise<boolean>;
  setLabel(label: string, anchorTabId?: number, silent?: boolean): Promise<boolean>;
}

const LOG_PREFIX = "[zen-tab-search]";
const TIMER_STORAGE_KEY = "tabTimers";
const TIMER_ALARM_PREFIX = "tab-timer:";

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

function isExtensionPageUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return url.startsWith("moz-extension:") || url.startsWith("chrome-extension:");
}

function isUsableBrowserTabId(tabId: number | undefined, url?: string): boolean {
  return Number.isInteger(tabId) && tabId! >= 0 && !isExtensionPageUrl(url);
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
    try {
      const preferred = await browser.tabs.get(preferredTabId!);
      if (isUsableBrowserTabId(preferred.id, preferred.url)) {
        return preferred.id;
      }
    } catch {
      // Preferred tab may already be gone.
    }
  }

  const queries: Array<Record<string, boolean>> = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
    { active: true },
    {},
  ];

  for (const query of queries) {
    const tabs = await browser.tabs.query(query);
    const tab = tabs.find((candidate) => isUsableBrowserTabId(candidate.id, candidate.url));
    if (tab?.id !== undefined) {
      return tab.id;
    }
  }

  return undefined;
}

let fallbackPopupWindowId: number | undefined;
let timerPopupWindowId: number | undefined;

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

async function openCustomTimerPopup(tabId: number): Promise<void> {
  if (Number.isInteger(timerPopupWindowId)) {
    try {
      await browser.windows.remove(timerPopupWindowId!);
    } catch {
      // Window was already closed.
    }
    timerPopupWindowId = undefined;
  }

  try {
    const window = await browser.windows.create({
      url: `${browser.runtime.getURL("timer-popup.html")}?tabId=${tabId}`,
      type: "popup",
      width: 420,
      height: 420,
      focused: true,
    });
    if (Number.isInteger(window.id)) {
      timerPopupWindowId = window.id;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not open custom timer popup:`, formatError(error));
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
        const focusedTabId = await resolveAnchorTabId(tabId);
        return tabs.map((tab) => ({
          ...tab,
          id: tab.id >= 0 ? tab.id : -1,
          active: Number.isInteger(tab.id) && tab.id === focusedTabId,
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

async function getTabInfo(tabId: number): Promise<TabInfo> {
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

async function getForgePageInfo(tabId?: number, url?: string): Promise<ForgePageInfo> {
  if (!Number.isInteger(tabId) || tabId! < 0 || !isContentScriptInjectableUrl(url)) {
    return {};
  }

  try {
    const info = await browser.tabs.sendMessage(tabId!, { type: "getForgePageInfo" });
    if (info && typeof info === "object") {
      return info as ForgePageInfo;
    }
  } catch (error) {
    debugLog(`${LOG_PREFIX} getForgePageInfo unavailable:`, formatError(error));
  }

  return {};
}

async function changeSelectedTabLabel(): Promise<void> {
  const zenTabs = getZenTabsApi();
  if (!zenTabs) {
    console.error(`${LOG_PREFIX} change-tab-label: zenTabs API unavailable`);
    return;
  }

  const tabId = await resolveAnchorTabId();
  const tab = Number.isInteger(tabId) && tabId! >= 0 ? await browser.tabs.get(tabId!) : undefined;
  const url = tab?.url || "";

  if (parseForgeUrl(url) && zenTabs.setLabel) {
    const pageInfo = await getForgePageInfo(tabId, url);
    const label = buildForgeLabel(url, tab?.title || "", pageInfo);
    if (label) {
      const set = await zenTabs.setLabel(label, zenAnchorTabId(tabId));
      if (set) {
        debugLog(`${LOG_PREFIX} change-tab-label: auto-set forge label`, { label, url });
        const editorOpened = await zenTabs.changeLabel(zenAnchorTabId(tabId));
        if (!editorOpened) {
          debugWarn(`${LOG_PREFIX} change-tab-label: could not open Zen label editor`);
        }
        return;
      }
    }
  }

  if (!zenTabs.changeLabel) {
    console.error(`${LOG_PREFIX} change-tab-label: zenTabs.changeLabel unavailable`);
    return;
  }

  const changed = await zenTabs.changeLabel(zenAnchorTabId(tabId));
  if (!changed) {
    debugWarn(
      `${LOG_PREFIX} change-tab-label: Zen did not start renaming (sidebar collapsed, essentials, or API unavailable)`,
    );
  }
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

const lastTimerIndicators = new Map<number, string>();
const updatingTimerTabs = new Set<number>();
const finishingTimerTabs = new Set<number>();

function timerAlarmName(tabId: number): string {
  return `${TIMER_ALARM_PREFIX}${tabId}`;
}

function timerNotificationId(tabId: number): string {
  return `tab-timer-${tabId}`;
}

async function readTimers(): Promise<Record<string, TabTimer>> {
  const stored = await browser.storage.local.get(TIMER_STORAGE_KEY);
  const timers = stored[TIMER_STORAGE_KEY];
  return timers && typeof timers === "object" ? (timers as Record<string, TabTimer>) : {};
}

async function writeTimers(timers: Record<string, TabTimer>): Promise<void> {
  await browser.storage.local.set({ [TIMER_STORAGE_KEY]: timers });
}

async function setTabLabelSilent(label: string, tabId: number): Promise<void> {
  const zenTabs = getZenTabsApi();
  if (!zenTabs?.setLabel) {
    return;
  }

  try {
    await zenTabs.setLabel(label, tabId, true);
  } catch (error) {
    debugWarn(`${LOG_PREFIX} Could not update timer tab label:`, formatError(error));
  }
}

async function updateTimerIndicator(timer: TabTimer): Promise<void> {
  const remaining = Math.max(0, timer.endAt - Date.now());
  const label = composeTimerLabel(remaining, timer.originalLabel);
  if (lastTimerIndicators.get(timer.tabId) === label || updatingTimerTabs.has(timer.tabId)) {
    return;
  }
  lastTimerIndicators.set(timer.tabId, label);
  updatingTimerTabs.add(timer.tabId);

  try {
    await setTabLabelSilent(label, timer.tabId);
  } finally {
    updatingTimerTabs.delete(timer.tabId);
  }
}

async function clearTimerIndicators(timer: TabTimer): Promise<void> {
  lastTimerIndicators.delete(timer.tabId);
  await setTabLabelSilent(timer.originalLabel, timer.tabId);
}

async function finishTimer(tabId: number, notify: boolean): Promise<void> {
  if (finishingTimerTabs.has(tabId)) {
    return;
  }
  finishingTimerTabs.add(tabId);

  try {
    const timers = await readTimers();
    const timer = timers[String(tabId)];
    if (!timer) {
      return;
    }

    delete timers[String(tabId)];
    await writeTimers(timers);
    await Promise.all([browser.alarms.clear(timerAlarmName(tabId)), clearTimerIndicators(timer)]);

    if (!notify) {
      return;
    }

    const tabName = timer.originalLabel || timer.title || "Untitled tab";
    try {
      await browser.notifications.create(timerNotificationId(tabId), {
        type: "basic",
        iconUrl: browser.runtime.getURL("icon/48.png"),
        title: "Tab timer finished",
        message: tabName,
      });
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not send timer notification:`, formatError(error));
    }
  } finally {
    finishingTimerTabs.delete(tabId);
  }
}

async function clearTabTimer(tabId: number): Promise<boolean> {
  const timers = await readTimers();
  const timer = timers[String(tabId)];
  if (!timer) {
    return false;
  }

  delete timers[String(tabId)];
  await writeTimers(timers);
  await browser.alarms.clear(timerAlarmName(tabId));
  await clearTimerIndicators(timer);
  return true;
}

async function clearAllTimers(): Promise<number> {
  const timers = await readTimers();
  const list = Object.values(timers);
  await writeTimers({});
  await Promise.all(
    list.flatMap((timer) => [
      browser.alarms.clear(timerAlarmName(timer.tabId)),
      clearTimerIndicators(timer),
    ]),
  );
  return list.length;
}

async function setTabTimer(tabId: number, endAt: number): Promise<TabTimer> {
  if (!isAllowedTimerEnd(endAt)) {
    throw new Error("Timer duration must be between 1 minute and 31 days.");
  }

  const existingTimers = await readTimers();
  const existing = existingTimers[String(tabId)];
  if (existing) {
    await clearTimerIndicators(existing);
  }

  const labels = await getCustomTabLabels([tabId]);
  let title = existing?.title || "";
  if (!title) {
    try {
      const tab = await browser.tabs.get(tabId);
      title = stripTimerPrefix(tab.title || "") || tab.url || "Untitled tab";
    } catch {
      title = "Untitled tab";
    }
  }
  const timer: TabTimer = {
    tabId,
    endAt,
    originalLabel: stripTimerPrefix(existing?.originalLabel ?? labels[tabId] ?? ""),
    title,
  };
  existingTimers[String(tabId)] = timer;
  await writeTimers(existingTimers);
  lastTimerIndicators.delete(tabId);
  await browser.alarms.clear(timerAlarmName(tabId));
  await browser.alarms.create(timerAlarmName(tabId), {
    when: endAt,
  });
  await updateTimerIndicator(timer);
  return timer;
}

let tickingTimers = false;

async function tickActiveTimers(): Promise<void> {
  if (tickingTimers) {
    return;
  }
  tickingTimers = true;
  try {
    const timers = await readTimers();
    for (const timer of Object.values(timers)) {
      if (timer.endAt <= Date.now()) {
        await finishTimer(timer.tabId, true);
      } else {
        void updateTimerIndicator(timer);
      }
    }
  } finally {
    tickingTimers = false;
  }
}

async function restorePersistedTimers(): Promise<void> {
  try {
    await browser.browserAction.setBadgeText({ text: "" });
  } catch {
    // Badge APIs are optional; leftover text should never stay on the toolbar icon.
  }

  const timers = await readTimers();
  let changed = false;
  for (const timer of Object.values(timers)) {
    const originalLabel = stripTimerPrefix(timer.originalLabel || "");
    if (originalLabel !== timer.originalLabel) {
      timer.originalLabel = originalLabel;
      changed = true;
    }
  }
  if (changed) {
    await writeTimers(timers);
  }

  for (const timer of Object.values(timers)) {
    if (timer.endAt <= Date.now() || timer.endAt - Date.now() > MAX_TIMER_MS) {
      await finishTimer(timer.tabId, timer.endAt <= Date.now());
      continue;
    }
    await browser.alarms.create(timerAlarmName(timer.tabId), { when: timer.endAt });
    lastTimerIndicators.delete(timer.tabId);
    await updateTimerIndicator(timer);
  }
}

async function getActiveTimers(): Promise<TabTimer[]> {
  const timers = await readTimers();
  const active: TabTimer[] = [];
  for (const timer of Object.values(timers)) {
    if (timer.endAt <= Date.now()) {
      await finishTimer(timer.tabId, true);
    } else {
      active.push(timer);
    }
  }
  return active;
}

export default defineBackground(() => {
  debugLog(`${LOG_PREFIX} background started at`, new Date().toISOString());

  void browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: "tab-timer",
      title: "Tab timer",
      contexts: ["tab"],
    });
    for (const [id, title] of [
      ["tab-timer-30-minutes", "30 minutes"],
      ["tab-timer-1-hour", "1 hour"],
      ["tab-timer-7-hours", "7 hours"],
      ["tab-timer-8-hours", "8 hours"],
    ]) {
      browser.contextMenus.create({
        id,
        parentId: "tab-timer",
        title,
        contexts: ["tab"],
      });
    }
    browser.contextMenus.create({
      id: "tab-timer-custom",
      parentId: "tab-timer",
      title: "Custom…",
      contexts: ["tab"],
    });
    browser.contextMenus.create({
      id: "tab-timer-clear",
      parentId: "tab-timer",
      title: "Clear timer",
      contexts: ["tab"],
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const tabId = tab?.id;
    if (!Number.isInteger(tabId) || tabId! < 0) {
      return;
    }

    if (info.menuItemId === "tab-timer-clear") {
      void clearTabTimer(tabId!).catch((error) => {
        console.error(`${LOG_PREFIX} Could not clear context-menu timer:`, formatError(error));
      });
      return;
    }

    const endAtByMenuId: Record<string, number> = {
      "tab-timer-30-minutes": Date.now() + 30 * 60_000,
      "tab-timer-1-hour": Date.now() + 60 * 60_000,
      "tab-timer-7-hours": Date.now() + 7 * 60 * 60_000,
      "tab-timer-8-hours": Date.now() + 8 * 60 * 60_000,
    };
    const endAt = endAtByMenuId[info.menuItemId as string];
    if (endAt) {
      void setTabTimer(tabId!, endAt).catch((error) => {
        console.error(`${LOG_PREFIX} Could not set context-menu timer:`, formatError(error));
      });
      return;
    }

    if (info.menuItemId === "tab-timer-custom") {
      void openCustomTimerPopup(tabId!);
    }
  });

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
    if (windowId === timerPopupWindowId) {
      timerPopupWindowId = undefined;
    }
  });

  void restorePersistedTimers().catch((error) => {
    debugWarn(`${LOG_PREFIX} Could not restore persisted timers:`, formatError(error));
  });
  setInterval(() => {
    void tickActiveTimers();
  }, 1000);

  browser.notifications.onClicked.addListener((notificationId) => {
    if (!notificationId.startsWith("tab-timer-")) {
      return;
    }
    const tabId = Number(notificationId.slice("tab-timer-".length));
    if (!Number.isInteger(tabId) || tabId < 0) {
      return;
    }
    void switchToTab(tabId, undefined, tabId).catch((error) => {
      debugWarn(`${LOG_PREFIX} Could not open timed tab from notification:`, formatError(error));
    });
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith(TIMER_ALARM_PREFIX)) {
      const tabId = Number(alarm.name.slice(TIMER_ALARM_PREFIX.length));
      void finishTimer(tabId, true);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void readTimers().then(async (timers) => {
      const timer = timers[String(tabId)];
      if (timer) {
        delete timers[String(tabId)];
        lastTimerIndicators.delete(tabId);
        await writeTimers(timers);
        await browser.alarms.clear(timerAlarmName(tabId));
      }
    });
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
      return;
    }

    if (command === "change-tab-label") {
      void changeSelectedTabLabel().catch((error) => {
        console.error(`${LOG_PREFIX} Error handling change-tab-label command:`, formatError(error));
      });
      return;
    }

    if (command === "set-tab-timer") {
      void resolveAnchorTabId()
        .then((tabId) => {
          if (!Number.isInteger(tabId) || tabId! < 0) {
            throw new Error("No current tab to set a timer on");
          }
          return openCustomTimerPopup(tabId!);
        })
        .catch((error) => {
          console.error(`${LOG_PREFIX} Error handling set-tab-timer command:`, formatError(error));
        });
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const senderTabId = isUsableBrowserTabId(sender.tab?.id, sender.tab?.url)
      ? sender.tab?.id
      : undefined;
    const anchorTabId = Number.isInteger(message.anchorTabId) ? message.anchorTabId : senderTabId;

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

    if (message.type === "getTab") {
      const tabId = Number(message.tabId);
      if (!Number.isInteger(tabId) || tabId < 0) {
        sendResponse({ error: "No tab selected for the timer." });
        return false;
      }
      getTabInfo(tabId)
        .then((tab) => sendResponse(tab))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    if (message.type === "getTimers") {
      getActiveTimers()
        .then((timers) => sendResponse(timers))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    if (message.type === "setTimer") {
      const tabId = Number(message.tabId);
      const durationMinutes = Number(message.durationMinutes);
      const endAt = Number.isFinite(Number(message.endAt))
        ? Number(message.endAt)
        : Date.now() + durationMinutes * 60_000;
      if (!Number.isInteger(tabId) || tabId < 0 || !isAllowedTimerEnd(endAt)) {
        sendResponse({ error: "Timer duration must be between 1 minute and 31 days." });
        return false;
      }
      setTabTimer(tabId, endAt)
        .then((timer) => sendResponse(timer))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    if (message.type === "clearTimer") {
      const tabId = Number(message.tabId);
      clearTabTimer(tabId)
        .then((cleared) => sendResponse({ success: true, cleared }))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    if (message.type === "clearAllTimers") {
      clearAllTimers()
        .then((cleared) => sendResponse({ success: true, cleared }))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    }

    return false;
  });
});
