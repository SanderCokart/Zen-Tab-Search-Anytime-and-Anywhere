import { DEBUG, debugLog, debugWarn } from "@/shared/debug";
import { registerCommands } from "@/app/background/commands";
import { registerMessageRouter } from "@/app/background/message-router";
import { registerTimerContextMenus } from "@/features/timers/background/context-menu";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { registerPopupWindowTracking } from "@/app/background/popup-tracking";
import { openSettingsPopup } from "@/features/settings/background/popup";
import { openCustomTimerPopup } from "@/features/timers/background/popup";
import {
  createSnapshotReader,
  notifySnapshotChanged,
  registerSnapshotChangeNotifications,
} from "@/features/search/background/snapshot";
import { createTabQuery } from "@/features/zen/tabs-query";
import { createTabSwitcher } from "@/features/zen/tabs-switch";
import { createTimerService } from "@/features/timers/background/timer-service";
import { createZenWorkspaceAdapter } from "@/features/zen/adapter";
import { logZenDebugInfo, warmUpZenTabsApi } from "@/features/zen/debug";
import { isAllowedTimerEnd } from "@/features/timers/model/timer";
import { isUsableTabId } from "@/shared/types";
import {
  readTabLastOpened,
  recordTabLastOpened,
  registerTabLastOpenedTracking,
} from "@/features/zen/tab-last-opened";
import { registerBrowserExternalTabReuse } from "@/features/intercept/background/external-tab";

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

  const getSnapshot = createSnapshotReader({
    queryTabs,
    getSpaces,
    getTimers: timerService.getActiveTimers,
    readLastOpened: readTabLastOpened,
  });

  registerTimerContextMenus(timerService);
  registerPopupWindowTracking();
  registerBrowserExternalTabReuse({
    listTabs: (anchorTabId) => workspace.listTabs(anchorTabId),
    activateTab: (tabId, domId, anchorTabId) => workspace.activateTab(tabId, domId, anchorTabId),
    removeTab: (tabId) => browser.tabs.remove(tabId),
    recordOpened: recordTabLastOpened,
  });
  registerCommands(workspace);
  registerSnapshotChangeNotifications();
  registerTabLastOpenedTracking();

  if (DEBUG) {
    browser.tabs.onActivated.addListener(() => {
      void warmUpZenTabsApi(workspace);
    });
    void warmUpZenTabsApi(workspace);
  }

  void timerService.restorePersistedTimers().catch((error) => {
    debugWarn(`${LOG_PREFIX} Could not restore persisted timers:`, formatError(error));
  });
  browser.windows.onCreated.addListener(() => {
    void timerService.restorePersistedTimers().catch((error) => {
      debugWarn(`${LOG_PREFIX} Could not restore persisted timers:`, formatError(error));
    });
  });
  setInterval(() => {
    void timerService.tickActiveTimers();
  }, 1000);

  browser.notifications.onClicked.addListener((notificationId) => {
    if (!notificationId.startsWith("tab-timer-")) {
      return;
    }
    const tabId = Number(notificationId.slice("tab-timer-".length));
    if (!isUsableTabId(tabId)) {
      return;
    }
    void switchToTab(tabId, undefined, tabId).catch((error) => {
      debugWarn(`${LOG_PREFIX} Could not open timed tab from notification:`, formatError(error));
    });
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith("tab-timer:")) {
      const tabId = Number(alarm.name.slice("tab-timer:".length));
      if (isUsableTabId(tabId)) {
        void timerService.finishTimer(tabId, true);
      }
    }
  });

  browser.tabs.onCreated.addListener((tab) => {
    if (isUsableTabId(tab.id)) {
      void timerService.adoptRestoredTab(tab.id);
    }
  });

  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    void timerService.handleTabRemoved(tabId, removeInfo.isWindowClosing);
  });

  registerMessageRouter({
    queryTabs,
    getSpaces,
    getDebugInfo: (anchorTabId) => workspace.getDebugInfo(anchorTabId),
    switchTab: async (tabId, domId, anchorTabId) => {
      await switchToTab(tabId, domId, anchorTabId);
      if (isUsableTabId(tabId)) {
        await recordTabLastOpened(tabId);
      }
    },
    switchSpace: switchToSpace,
    getTab: getTabInfo,
    getSnapshot,
    getTimers: timerService.getActiveTimers,
    openTimerPopup: (tabId) => openCustomTimerPopup(tabId),
    setTimer: timerService.setTabTimer,
    clearTimer: timerService.clearTabTimer,
    clearAllTimers: timerService.clearAllTimers,
    openSettings: openSettingsPopup,
    setTabLabel: async (tabId, label) => {
      const renamed = await timerService.renameTab(tabId, label);
      if (!renamed) {
        throw new Error("Could not rename this tab.");
      }
      notifySnapshotChanged();
    },
    isAllowedTimerEnd: (endAt) => isAllowedTimerEnd(endAt),
  });
});
