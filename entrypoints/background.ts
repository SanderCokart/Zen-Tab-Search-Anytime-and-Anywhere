import { DEBUG, debugLog, debugWarn } from "@/shared/debug";
import { registerCommands } from "@/app/background/commands";
import { registerMessageRouter } from "@/app/background/message-router";
import { registerTimerContextMenus } from "@/features/timers/background/context-menu";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { registerPopupWindowTracking } from "@/app/background/popup-tracking";
import { openSettingsPopup } from "@/features/settings/background/popup";
import { openCustomTimerPopup } from "@/features/timers/background/popup";
import {
  createCachedSnapshotReader,
  createSnapshotReader,
  notifySnapshotChanged,
  registerSnapshotChangeNotifications,
} from "@/features/search/background/snapshot";
import { searchSnapshotSchema } from "@/shared/messaging/protocol";
import * as v from "valibot";
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
import { startBridgeClient } from "@/features/bridge/background/bridge-client";
import { createBridgeCommandHandler } from "@/features/bridge/background/zen-commands";
import { BRIDGE_TOKEN_STORAGE_KEY } from "@/shared/messaging/bridge-protocol";
import { createTodoService } from "@/features/todos/background/todo-service";
import { detectForgeLabels } from "@/features/forge/background/label-command";

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

  const todoService = createTodoService();

  const snapshotCache = createCachedSnapshotReader(
    createSnapshotReader({
      queryTabs,
      getSpaces,
      getTimers: timerService.getActiveTimers,
      getTodos: todoService.getTodos,
      readLastOpened: readTabLastOpened,
    }),
  );
  const notify = () => {
    snapshotCache.invalidate();
    notifySnapshotChanged();
  };
  const getSnapshot = async (anchorTabId?: number) =>
    v.parse(searchSnapshotSchema, await snapshotCache.getSnapshot(anchorTabId));

  registerTimerContextMenus(timerService, todoService, notify);
  registerPopupWindowTracking();
  registerBrowserExternalTabReuse({
    listTabs: (anchorTabId) => workspace.listTabs(anchorTabId),
    activateTab: (tabId, domId, anchorTabId) => workspace.activateTab(tabId, domId, anchorTabId),
    removeTab: (tabId) => browser.tabs.remove(tabId),
    recordOpened: recordTabLastOpened,
  });
  registerCommands(workspace);
  registerSnapshotChangeNotifications(150, snapshotCache.invalidate);
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
      void todoService.hydrate([tab.id]);
    }
  });
  void browser.tabs
    .query({})
    .then((tabs) =>
      todoService.hydrate(tabs.flatMap((tab) => (isUsableTabId(tab.id) ? [tab.id] : []))),
    )
    .catch((error) => {
      debugWarn(`${LOG_PREFIX} Could not hydrate todos:`, formatError(error));
    });

  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    todoService.forget(tabId);
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
      notify();
    },
    setTodo: async (tabId, status, light) => {
      await todoService.setTodo(tabId, status, light);
      notify();
    },
    isAllowedTimerEnd: (endAt) => isAllowedTimerEnd(endAt),
  });

  const bridge = startBridgeClient({
    handle: createBridgeCommandHandler(workspace, {
      timers: {
        setTabTimer: timerService.setTabTimer,
        clearTabTimer: timerService.clearTabTimer,
        getActiveTimers: timerService.getActiveTimers,
      },
      todos: {
        setTodo: async (tabId, status) => {
          await todoService.setTodo(tabId, status);
          notify();
        },
        getTodos: todoService.getTodos,
      },
      detectForgeLabels: async (tabs, options) => {
        const detections = await detectForgeLabels(workspace, tabs, options);
        if (detections.some((detection) => detection.applied)) {
          notify();
        }
        return detections;
      },
    }),
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && BRIDGE_TOKEN_STORAGE_KEY in changes) {
      bridge.reconnect();
    }
  });
});
