import { DEBUG, debugLog, debugWarn } from "@/lib/debug";
import { registerCommands } from "@/lib/background/commands";
import { registerMessageRouter } from "@/lib/background/message-router";
import { registerTimerContextMenus } from "@/lib/background/menus/timer-context";
import { formatError, LOG_PREFIX } from "@/lib/background/log";
import { registerPopupWindowTracking } from "@/lib/background/popups";
import { openSettingsPopup } from "@/lib/background/popups/settings";
import { openCustomTimerPopup } from "@/lib/background/popups/timer";
import {
  createSnapshotReader,
  notifySnapshotChanged,
  registerSnapshotChangeNotifications,
} from "@/lib/background/snapshot";
import { createTabQuery } from "@/lib/background/tabs/query";
import { createTabSwitcher } from "@/lib/background/tabs/switch";
import { createTimerService } from "@/lib/background/timer-service";
import { createZenWorkspaceAdapter } from "@/lib/background/zen/adapter";
import { logZenDebugInfo, warmUpZenTabsApi } from "@/lib/background/zen/debug";
import { isAllowedTimerEnd } from "@/lib/timer";
import { isUsableTabId } from "@/lib/types";
import {
  readTabLastOpened,
  recordTabLastOpened,
  registerTabLastOpenedTracking,
} from "@/lib/background/tab-last-opened";

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
