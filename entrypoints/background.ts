import { DEBUG, debugLog, debugWarn } from "../lib/debug";
import { registerCommands } from "../lib/background/commands";
import { registerMessageRouter } from "../lib/background/message-router";
import { registerTimerContextMenus } from "../lib/background/menus/timer-context";
import { formatError, LOG_PREFIX } from "../lib/background/log";
import { registerPopupWindowTracking } from "../lib/background/popups";
import { createTabQuery } from "../lib/background/tabs/query";
import { createTabSwitcher } from "../lib/background/tabs/switch";
import { createTimerService } from "../lib/background/timer-service";
import { createZenWorkspaceAdapter } from "../lib/background/zen/adapter";
import { logZenDebugInfo, warmUpZenTabsApi } from "../lib/background/zen/debug";
import { isAllowedTimerEnd } from "../lib/timer";

export default defineBackground(() => {
  debugLog(`${LOG_PREFIX} background started at`, new Date().toISOString());
  const workspace = createZenWorkspaceAdapter({
    logDebugInfo: (context, anchorTabId) => logZenDebugInfo(workspace, context, anchorTabId),
  });
  const { queryTabs, getTabInfo, getSpaces } = createTabQuery(workspace);
  const { switchToTab, switchToSpace } = createTabSwitcher(workspace);
  const timerService = createTimerService({
    setLabel: (label, tabId, silent) => workspace.setLabel(label, tabId, silent),
    getCustomTabLabels: (tabIds) => workspace.getCustomLabels(tabIds),
  });

  registerTimerContextMenus(timerService);
  registerPopupWindowTracking();
  registerCommands(workspace);

  if (DEBUG) {
    browser.tabs.onActivated.addListener(() => {
      void warmUpZenTabsApi(workspace);
    });
    void warmUpZenTabsApi(workspace);
  }

  void timerService.restorePersistedTimers().catch((error) => {
    debugWarn(`${LOG_PREFIX} Could not restore persisted timers:`, formatError(error));
  });
  setInterval(() => {
    void timerService.tickActiveTimers();
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
    if (alarm.name.startsWith("tab-timer:")) {
      const tabId = Number(alarm.name.slice("tab-timer:".length));
      void timerService.finishTimer(tabId, true);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void timerService.removeTabTimer(tabId);
  });

  registerMessageRouter({
    queryTabs,
    getSpaces,
    getDebugInfo: (anchorTabId) => workspace.getDebugInfo(anchorTabId),
    switchTab: switchToTab,
    switchSpace: switchToSpace,
    getTab: getTabInfo,
    getTimers: timerService.getActiveTimers,
    setTimer: timerService.setTabTimer,
    clearTimer: timerService.clearTabTimer,
    clearAllTimers: timerService.clearAllTimers,
    isAllowedTimerEnd: (endAt) => isAllowedTimerEnd(endAt),
  });
});
