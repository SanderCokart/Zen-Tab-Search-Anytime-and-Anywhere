import { DEBUG, debugLog, debugWarn } from "../lib/debug";
import { registerCommands } from "../lib/background/commands";
import { registerMessageRouter } from "../lib/background/message-router";
import { registerTimerContextMenus } from "../lib/background/menus/timer-context";
import { formatError, LOG_PREFIX } from "../lib/background/log";
import { registerPopupWindowTracking } from "../lib/background/popups";
import { getTabInfo, getSpaces, queryTabs } from "../lib/background/tabs/query";
import { switchToSpace, switchToTab } from "../lib/background/tabs/switch";
import { createTimerService } from "../lib/background/timer-service";
import { getZenTabsApi } from "../lib/background/zen/api";
import { getCustomTabLabels } from "../lib/background/zen/labels";
import { getZenDebugInfoPayload, warmUpZenTabsApi } from "../lib/background/zen/debug";
import { isAllowedTimerEnd } from "../lib/timer";

export default defineBackground(() => {
  debugLog(`${LOG_PREFIX} background started at`, new Date().toISOString());
  const timerService = createTimerService({
    getZenTabsApi,
    getCustomTabLabels,
  });

  registerTimerContextMenus(timerService);
  registerPopupWindowTracking();
  registerCommands();

  if (DEBUG) {
    browser.tabs.onActivated.addListener(() => {
      void warmUpZenTabsApi();
    });
    void warmUpZenTabsApi();
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
    getDebugInfo: getZenDebugInfoPayload,
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
