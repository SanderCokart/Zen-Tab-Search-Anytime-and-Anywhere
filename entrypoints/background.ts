import { DEBUG, debugLog, debugWarn } from "@/shared/debug";
import { registerCommands } from "@/app/background/commands";
import { registerMessageRouter } from "@/app/background/message-router";
import { registerContextMenus } from "@/app/background/context-menus";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { registerPopupWindowTracking } from "@/app/background/popup-tracking";
import { openSettingsPopup } from "@/features/settings/background/popup";
import {
  startSettingsBackup,
  wipeExtensionData,
} from "@/features/settings/background/settings-backup";
import { openCustomTimerPopup } from "@/features/timers/background/popup";
import { openHostOverridesPopup } from "@/features/hosts/background/popup";
import {
  getOmnibarAnchorTabId,
  hideOmnibar,
  OMNIBAR_PAGE,
  openOmnibarView,
  preloadOmnibar,
} from "@/features/search/background/omnibar";
import {
  createCachedSnapshotReader,
  createSnapshotReader,
  notifySnapshotChanged,
  registerSnapshotChangeNotifications,
} from "@/features/search/background/snapshot";
import {
  BRIDGE_STATUS_CHANGED_TYPE,
  searchSnapshotSchema,
  TAB_ZOOM_CHANGED_TYPE,
} from "@/shared/messaging/protocol";
import * as v from "valibot";
import { createTabQuery } from "@/features/zen/tabs-query";
import { createTabSwitcher } from "@/features/zen/tabs-switch";
import { createTimerService } from "@/features/timers/background/timer-service";
import { createZenWorkspaceAdapter } from "@/features/zen/adapter";
import { organizeForgeIssueTabs } from "@/features/forge/background/forge-tab-organize-service";
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
import {
  ESSENTIAL_TAB_NAMES_KEY,
  parseEssentialTabNames,
} from "@/features/search/model/essential-tab-names";
import { BRIDGE_TOKEN_STORAGE_KEY } from "@/shared/messaging/bridge-protocol";
import { createTodoService } from "@/features/todos/background/todo-service";
import { createStatusService } from "@/features/status/background/status-service";
import { detectForgeLabels } from "@/features/forge/background/label-command";
import { getForgePageInfo } from "@/features/forge/background/page-info";
import {
  createTargetBranchService,
  registerTargetBranchCollection,
} from "@/features/forge/background/target-branch-service";
import {
  createHostOverrideService,
  parseHostOverrideNotificationTabId,
  registerHostOverrides,
} from "@/features/hosts/background/host-override-service";
import {
  createUpdateService,
  registerUpdateChecks,
} from "@/features/updates/background/update-service";

export default defineBackground(() => {
  debugLog(`${LOG_PREFIX} background started at`, new Date().toISOString());
  void startSettingsBackup().catch((error) => {
    debugWarn(`${LOG_PREFIX} Could not start settings backup:`, formatError(error));
  });
  const workspace = createZenWorkspaceAdapter({
    logDebugInfo: (context, anchorTabId) => logZenDebugInfo(workspace, context, anchorTabId),
  });
  const { queryTabs, getTabInfo, getSpaces, listAllTabs } = createTabQuery(workspace);
  const { switchToTab, switchToSpace } = createTabSwitcher(workspace);
  const timerService = createTimerService({
    setLabel: (label, tabId, silent) => workspace.setLabel(label, tabId, silent),
    listTabs: listAllTabs,
  });

  const todoService = createTodoService();
  const statusService = createStatusService();
  const hostOverrideService = createHostOverrideService();
  const updateService = createUpdateService();
  registerUpdateChecks(updateService);
  const targetBranchService = createTargetBranchService({ getPageInfo: getForgePageInfo });
  registerTargetBranchCollection(targetBranchService);

  const snapshotCache = createCachedSnapshotReader(
    createSnapshotReader({
      queryTabs,
      getSpaces,
      getTimers: timerService.getActiveTimers,
      getTodos: todoService.getTodos,
      getStatuses: statusService.getStatuses,
      readLastOpened: readTabLastOpened,
      readTargetBranches: targetBranchService.read,
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
    organizeForgeTabs: async (tabId, mode) => {
      const snapshot = await getSnapshot(tabId);
      const parentFolderId = snapshot.tabs.find((tab) => tab.id === tabId)?.folderId;
      if (!parentFolderId) {
        return;
      }
      await organizeForgeIssueTabs({
        workspace,
        tabs: snapshot.tabs,
        mode,
        parentFolderId,
        anchorTabId: tabId,
      });
    },
    getTabFolderId: async (tabId) => {
      try {
        return (await workspace.getTab(tabId)).folderId;
      } catch {
        return undefined;
      }
    },
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
  // An open overlay re-reads its tab's zoom, so it keeps its size on screen.
  browser.tabs.onZoomChange.addListener(() => {
    void browser.runtime.sendMessage({ type: TAB_ZOOM_CHANGED_TYPE }).catch(() => {
      // No overlay is listening.
    });
  });
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
    void timerService
      .resolveNotificationClick(notificationId)
      .then(async (target) => {
        if (target?.kind === "tab") {
          await switchToTab(target.tabId, undefined, target.tabId);
        } else if (target?.kind === "search") {
          await openOmnibarView({ kind: "search", query: target.query });
        }
      })
      .catch((error) => {
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

  let bridgeConnected = false;

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
      await Promise.all(
        tabIds.flatMap((tabId) => [
          todoService.setTodo(tabId, "none"),
          statusService.setStatus(tabId, "none"),
        ]),
      );
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
    // `tabs.getZoom` needs no permission beyond what the manifest already asks for.
    getTabZoom: async (tabId) => {
      if (tabId === undefined) return 1;
      try {
        return await browser.tabs.getZoom(tabId);
      } catch {
        return 1;
      }
    },
    getUpdateStatus: updateService.getStatus,
    getBridgeStatus: async () => ({ connected: bridgeConnected }),
    resetExtensionData: wipeExtensionData,
    openUpdate: async (page) => {
      await updateService.open(page);
      await hideOmnibar();
    },
    installUpdate: updateService.install,
    closeTab: async (tabId) => {
      await workspace.closeTab(tabId);
      notify();
    },
    getFolders: async (anchorTabId) => {
      try {
        return await workspace.listFolders(anchorTabId);
      } catch {
        return [];
      }
    },
    moveTabToFolder: async (tabId, folderId) => {
      await workspace.moveTabsToFolder([tabId], folderId);
      notify();
    },
    removeTabFromFolder: async (tabId) => {
      await workspace.removeTabsFromFolder([tabId]);
      notify();
    },
    organizeForgeIssueTabs: async (mode, anchorTabId, tabIds) => {
      const snapshot = await getSnapshot(anchorTabId);
      const result = await organizeForgeIssueTabs({
        workspace,
        tabs: snapshot.tabs,
        mode,
        tabIds,
        anchorTabId,
      });
      notify();
      return result;
    },
    getPinnedUrl: (tabId) => workspace.getPinnedUrl(tabId),
    setPinnedUrl: async (tabId, url) => {
      await workspace.setPinnedUrl(tabId, url);
      notify();
    },
    replacePinnedUrlWithCurrent: async (tabId) => {
      await workspace.replacePinnedUrlWithCurrent(tabId);
      notify();
    },
    openUrl: async (url) => {
      await browser.tabs.create({ url, active: true });
    },
    anchorTabIdForSender: (sender) =>
      sender.tab === undefined && sender.url?.startsWith(browser.runtime.getURL(OMNIBAR_PAGE))
        ? getOmnibarAnchorTabId()
        : undefined,
    isAllowedTimerEnd: (endAt) => isAllowedTimerEnd(endAt),
  });

  const bridge = startBridgeClient({
    onConnectedChange: (connected) => {
      bridgeConnected = connected;
      void browser.runtime
        .sendMessage({ type: BRIDGE_STATUS_CHANGED_TYPE, connected })
        .catch(() => undefined);
    },
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
      essentialNames: {
        getNames: async () =>
          parseEssentialTabNames(
            (await browser.storage.local.get(ESSENTIAL_TAB_NAMES_KEY))[ESSENTIAL_TAB_NAMES_KEY],
          ),
        setNames: async (names) => {
          await browser.storage.local.set({ [ESSENTIAL_TAB_NAMES_KEY]: names });
          notify();
        },
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
