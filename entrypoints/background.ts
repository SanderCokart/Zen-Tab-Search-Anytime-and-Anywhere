import { DEBUG, debugLog, debugWarn } from "@/shared/debug";
import { registerCommands } from "@/app/background/commands";
import { registerMessageRouter } from "@/app/background/message-router";
import { registerContextMenus } from "@/app/background/context-menus";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { registerPopupWindowTracking } from "@/app/background/popup-tracking";
import { openSettingsPopup } from "@/features/settings/background/popup";
import { openCustomTimerPopup } from "@/features/timers/background/popup";
import { openHostOverridesPopup } from "@/features/hosts/background/popup";
import { hideOmnibar, preloadOmnibar } from "@/features/search/background/omnibar";
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
import { createStatusService } from "@/features/status/background/status-service";
import { detectForgeLabels } from "@/features/forge/background/label-command";
import {
  createHostOverrideService,
  parseHostOverrideNotificationTabId,
  registerHostOverrides,
} from "@/features/hosts/background/host-override-service";

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
  const statusService = createStatusService();
  const hostOverrideService = createHostOverrideService();

  const snapshotCache = createCachedSnapshotReader(
    createSnapshotReader({
      queryTabs,
      getSpaces,
      getTimers: timerService.getActiveTimers,
      getTodos: todoService.getTodos,
      getStatuses: statusService.getStatuses,
      readLastOpened: readTabLastOpened,
    }),
  );
  const notify = () => {
    snapshotCache.invalidate();
    notifySnapshotChanged();
  };
  const getSnapshot = async (anchorTabId?: number) =>
    v.parse(searchSnapshotSchema, await snapshotCache.getSnapshot(anchorTabId));

  registerContextMenus({
    timers: timerService,
    todos: todoService,
    hosts: hostOverrideService,
    onChanged: notify,
  });
  registerHostOverrides(hostOverrideService);
  registerPopupWindowTracking();
  registerBrowserExternalTabReuse({
    listTabs: (anchorTabId) => workspace.listTabs(anchorTabId),
    activateTab: (tabId, domId, anchorTabId) => workspace.activateTab(tabId, domId, anchorTabId),
    removeTab: (tabId) => browser.tabs.remove(tabId),
    recordOpened: recordTabLastOpened,
  });
  registerCommands(workspace, {
    warmSnapshot: (anchorTabId) => {
      void snapshotCache.getSnapshot(anchorTabId).catch(() => {
        // The overlay's own request reports the failure.
      });
    },
  });
  registerSnapshotChangeNotifications(150, snapshotCache.invalidate);
  // Each window gets its overlay built while idle, so Alt+F only has to show it.
  void preloadOmnibar();
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== browser.windows.WINDOW_ID_NONE) void preloadOmnibar();
  });
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
    const hostOverrideTabId = parseHostOverrideNotificationTabId(notificationId);
    if (hostOverrideTabId !== undefined) {
      void switchToTab(hostOverrideTabId, undefined, hostOverrideTabId).catch((error) => {
        debugWarn(`${LOG_PREFIX} Could not open routed tab from notification:`, formatError(error));
      });
      return;
    }
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
      void statusService.hydrate([tab.id]);
      void hostOverrideService.load([tab.id]);
    }
  });
  void browser.tabs
    .query({})
    .then((tabs) => {
      const tabIds = tabs.flatMap((tab) => (isUsableTabId(tab.id) ? [tab.id] : []));
      return Promise.all([
        todoService.hydrate(tabIds),
        statusService.hydrate(tabIds),
        hostOverrideService.load(tabIds),
      ]);
    })
    .catch((error) => {
      debugWarn(
        `${LOG_PREFIX} Could not hydrate todos, statuses and host overrides:`,
        formatError(error),
      );
    });

  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    todoService.forget(tabId);
    statusService.forget(tabId);
    hostOverrideService.forget(tabId);
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
    setTodo: async (tabId, status) => {
      await todoService.setTodo(tabId, status);
      notify();
    },
    setTabStatus: async (tabId, light) => {
      await statusService.setStatus(tabId, light);
      notify();
    },
    clearTodos: async (tabIds) => {
      await Promise.all(tabIds.map((tabId) => todoService.setTodo(tabId, "none")));
      notify();
    },
    getHostOverrides: hostOverrideService.getOverrides,
    setHostOverrides: async (tabId, groups) => {
      const saved = await hostOverrideService.setOverrides(tabId, groups);
      notify();
      return saved;
    },
    getGlobalHostOverrides: hostOverrideService.getGlobalOverrides,
    setGlobalHostOverrides: async (groups) => {
      const saved = await hostOverrideService.setGlobalOverrides(groups);
      notify();
      return saved;
    },
    getHostProxyStatus: hostOverrideService.getStatus,
    openHostOverridesPopup,
    hideOmnibar,
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
      statuses: {
        setStatus: async (tabId, light) => {
          await statusService.setStatus(tabId, light);
          notify();
        },
        getStatuses: statusService.getStatuses,
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
