import type { WorkspaceAdapter } from "@/features/zen/adapter";
import type { ForgeDetection } from "@/features/forge/background/label-command";
import { isAllowedTimerEnd, parseTimerInput } from "@/features/timers/model/timer";
import type { BridgeCommand, TabSummary } from "@/shared/messaging/bridge-protocol";
import {
  isUsableTabId,
  type TabInfo,
  type TabStatus,
  type TabTimer,
  type TabTodo,
  type TodoStatus,
  type TrafficLight,
} from "@/shared/types";

export type BridgeWorkspace = Pick<
  WorkspaceAdapter,
  | "listTabs"
  | "listSelectedTabs"
  | "listSpaces"
  | "listFolders"
  | "activateTab"
  | "switchSpace"
  | "setLabel"
  | "createFolder"
  | "renameFolder"
  | "moveTabsToFolder"
  | "removeTabsFromFolder"
  | "moveTabsToSpace"
  | "moveTab"
  | "openTab"
  | "closeTab"
  | "closeTabs"
  | "getTab"
  | "createSpace"
  | "renameSpace"
  | "moveFolder"
  | "deleteFolders"
  | "deleteSpaces"
  | "setEssential"
  | "clearEssential"
>;

/** Timer operations, backed by the same service the timer UI uses. */
export interface BridgeTimers {
  setTabTimer(tabId: number, endAt: number): Promise<TabTimer>;
  clearTabTimer(tabId: number): Promise<boolean>;
  getActiveTimers(): Promise<TabTimer[]>;
}

/** Todo operations, backed by the same service the todo column uses. */
export interface BridgeTodos {
  setTodo(tabId: number, status: TodoStatus | "none"): Promise<void>;
  getTodos(tabIds: number[]): Promise<TabTodo[]>;
}

/** Status color operations, backed by the same service the traffic-light UI uses. */
export interface BridgeStatuses {
  setStatus(tabId: number, light: TrafficLight | "none"): Promise<void>;
  getStatuses(tabIds: number[]): Promise<TabStatus[]>;
}

/** Everything beyond the Zen workspace that a bridge command may need. */
export interface BridgeServices {
  timers: BridgeTimers;
  todos: BridgeTodos;
  statuses: BridgeStatuses;
  /** Labels the given tabs (or only reports them when `dryRun`). */
  detectForgeLabels(tabs: TabInfo[], options: { dryRun: boolean }): Promise<ForgeDetection[]>;
}

const unavailableServices: BridgeServices = {
  timers: {
    setTabTimer: async () => unavailable("timers"),
    clearTabTimer: async () => unavailable("timers"),
    getActiveTimers: async () => unavailable("timers"),
  },
  todos: {
    setTodo: async () => unavailable("todos"),
    getTodos: async () => unavailable("todos"),
  },
  statuses: {
    setStatus: async () => unavailable("status colors"),
    getStatuses: async () => [],
  },
  detectForgeLabels: async () => unavailable("forge detection"),
};

function unavailable(what: string): never {
  throw new Error(`${what} are not available in this context.`);
}

function timerView(timer: TabTimer) {
  return {
    tabId: timer.tabId,
    title: timer.title,
    label: timer.originalLabel || null,
    endAt: timer.endAt,
    endsAt: new Date(timer.endAt).toISOString(),
  };
}

function todoView(todo: TabTodo, tab: TabInfo | undefined) {
  return {
    tabId: todo.tabId,
    status: todo.status,
    title: tab?.title ?? "",
    label: tab?.customLabel?.trim() || null,
    url: tab?.url ?? "",
    spaceId: tab?.workspaceId ?? null,
    spaceName: tab?.workspaceName ?? null,
    folderId: tab?.folderId ?? null,
    folderName: tab?.folderName ?? null,
  };
}

function statusView(status: TabStatus, tab: TabInfo | undefined) {
  return {
    tabId: status.tabId,
    color: status.light,
    title: tab?.title ?? "",
    label: tab?.customLabel?.trim() || null,
    url: tab?.url ?? "",
    spaceId: tab?.workspaceId ?? null,
    spaceName: tab?.workspaceName ?? null,
    folderId: tab?.folderId ?? null,
    folderName: tab?.folderName ?? null,
  };
}

/**
 * Favicons are data URLs that can run to tens of kilobytes each; an agent
 * reading a tab list has no use for them, so they never leave the extension.
 */
export function summarizeTab(tab: TabInfo): TabSummary {
  return {
    id: tab.id ?? -1,
    title: tab.title,
    ...(tab.customLabel ? { customLabel: tab.customLabel } : {}),
    url: tab.url,
    windowId: tab.windowId,
    ...(tab.workspaceId ? { spaceId: tab.workspaceId } : {}),
    ...(tab.workspaceName ? { spaceName: tab.workspaceName } : {}),
    ...(tab.folderId ? { folderId: tab.folderId } : {}),
    ...(tab.folderName ? { folderName: tab.folderName } : {}),
    ...(tab.folderPath?.length ? { folderPath: tab.folderPath } : {}),
    ...(tab.essential ? { essential: true } : {}),
    ...(tab.active ? { active: true } : {}),
  };
}

function matchesListFilter(tab: TabInfo, filter: { spaceId?: string; folderId?: string }): boolean {
  if (filter.spaceId && tab.workspaceId !== filter.spaceId) {
    return false;
  }
  // A tab in a subfolder is also inside each of its ancestor folders.
  if (filter.folderId && !tab.folderPath?.some((folder) => folder.id === filter.folderId)) {
    return false;
  }
  return true;
}

type OpenTabCommand = Extract<BridgeCommand, { type: "openTab" }>;

const MAX_PENDING_URLS = 200;

/**
 * A tab opened a moment ago still reports about:blank until it starts loading.
 * Remembering what it was asked to load keeps a second "open Drive" call from
 * missing the first one's tab and opening a duplicate.
 */
function createPendingUrls() {
  const urls = new Map<number, string>();
  return {
    remember(tabId: number, url: string) {
      urls.set(tabId, url);
      if (urls.size > MAX_PENDING_URLS) {
        urls.delete(urls.keys().next().value!);
      }
    },
    apply(tab: TabSummary): TabSummary {
      const pending = urls.get(tab.id);
      if (pending === undefined) {
        return tab;
      }
      if (tab.url && tab.url !== "about:blank") {
        urls.delete(tab.id);
        return tab;
      }
      return { ...tab, url: pending };
    },
  };
}

type PendingUrls = ReturnType<typeof createPendingUrls>;

/** Checks the requested space or folder before a tab exists, so a typo opens nothing. */
async function checkOpenTarget(workspace: BridgeWorkspace, command: OpenTabCommand): Promise<void> {
  if (command.folderId) {
    const folder = (await workspace.listFolders()).find((entry) => entry.id === command.folderId);
    if (!folder) {
      throw new Error(
        `Folder not found: ${command.folderId}. Get folder IDs from zen_list_folders.`,
      );
    }
    if (command.spaceId && folder.spaceId !== command.spaceId) {
      throw new Error(
        `Folder "${folder.name}" is in space "${folder.spaceName}" (${folder.spaceId}), not ${command.spaceId}. Leave out spaceId or pick a folder in that space.`,
      );
    }
    return;
  }
  if (command.spaceId) {
    const spaces = await workspace.listSpaces();
    if (!spaces.some((space) => space.id === command.spaceId)) {
      throw new Error(`Space not found: ${command.spaceId}. Get space IDs from zen_list_spaces.`);
    }
  }
}

async function openTab(
  workspace: BridgeWorkspace,
  command: OpenTabCommand,
  pendingUrls: PendingUrls,
) {
  await checkOpenTarget(workspace, command);
  const tabId = await workspace.openTab(command.url, { pinned: command.pinned });
  pendingUrls.remember(tabId, command.url);

  try {
    if (command.folderId) {
      await workspace.moveTabsToFolder([tabId], command.folderId);
    } else if (command.spaceId) {
      await workspace.moveTabsToSpace([tabId], command.spaceId);
    }
  } catch (error) {
    // Only the tab this call just opened is closed, so a failed call leaves nothing behind.
    await workspace.closeTab(tabId).catch(() => undefined);
    throw error;
  }

  if (command.active) {
    await workspace.activateTab(tabId);
  }
  return pendingUrls.apply(summarizeTab(await workspace.getTab(tabId)));
}

/**
 * Runs one validated bridge command against the Zen workspace adapter. Every
 * result is plain JSON so the MCP side can pass it straight to the agent.
 */
export function createBridgeCommandHandler(
  workspace: BridgeWorkspace,
  services: BridgeServices = unavailableServices,
) {
  const pendingUrls = createPendingUrls();
  const summarize = (tab: TabInfo) => pendingUrls.apply(summarizeTab(tab));

  async function withColors(tabs: TabSummary[]): Promise<TabSummary[]> {
    if (tabs.length === 0) {
      return tabs;
    }
    const marked = await services.statuses.getStatuses(tabs.map((tab) => tab.id));
    if (marked.length === 0) {
      return tabs;
    }
    const byId = new Map(marked.map((status) => [status.tabId, status.light]));
    return tabs.map((tab) => {
      const color = byId.get(tab.id);
      return color ? { ...tab, color } : tab;
    });
  }

  return async function handleBridgeCommand(command: BridgeCommand): Promise<unknown> {
    switch (command.type) {
      case "listTimers": {
        const timers = await services.timers.getActiveTimers();
        return timers.map(timerView);
      }

      case "setTimer": {
        const endAt = parseTimerInput(command.when);
        if (endAt === null) {
          throw new Error(
            `Could not read "${command.when}" as a time. Try "30m", "1h 30m", or "tomorrow at 9am".`,
          );
        }
        if (!isAllowedTimerEnd(endAt)) {
          throw new Error("Timer duration must be between 1 minute and 31 days.");
        }
        const timers: ReturnType<typeof timerView>[] = [];
        for (const tabId of command.tabIds) {
          timers.push(timerView(await services.timers.setTabTimer(tabId, endAt)));
        }
        return { endAt, endsAt: new Date(endAt).toISOString(), timers };
      }

      case "clearTimer": {
        const tabs: { tabId: number; cleared: boolean }[] = [];
        for (const tabId of command.tabIds) {
          const cleared = await services.timers.clearTabTimer(tabId);
          tabs.push({ tabId, cleared });
        }
        return { tabIds: command.tabIds, cleared: tabs.filter((tab) => tab.cleared).length, tabs };
      }

      case "listTodos": {
        const tabs = await workspace.listTabs();
        const byId = new Map(
          tabs.flatMap((tab) => (isUsableTabId(tab.id) ? [[tab.id, tab] as const] : [])),
        );
        const marked = await services.todos.getTodos([...byId.keys()]);
        const todoIds = new Set(marked.map((todo) => todo.tabId));
        const todo: ReturnType<typeof todoView>[] = [];
        for (const [tabId, tab] of byId) {
          if (todoIds.has(tabId)) {
            todo.push(todoView({ tabId, status: "todo" }, tab));
          }
        }
        return { todoCount: todo.length, todo };
      }

      case "setTodo": {
        for (const tabId of command.tabIds) {
          await services.todos.setTodo(tabId, command.status);
        }
        return { tabIds: command.tabIds, status: command.status };
      }

      case "clearTodo": {
        const existing = new Set(
          (await services.todos.getTodos(command.tabIds)).map((todo) => todo.tabId),
        );
        for (const tabId of command.tabIds) {
          await services.todos.setTodo(tabId, "none");
        }
        return {
          tabIds: command.tabIds,
          cleared: command.tabIds.filter((tabId) => existing.has(tabId)).length,
        };
      }

      case "listStatuses": {
        const tabs = await workspace.listTabs();
        const byId = new Map(
          tabs.flatMap((tab) => (isUsableTabId(tab.id) ? [[tab.id, tab] as const] : [])),
        );
        const marked = await services.statuses.getStatuses([...byId.keys()]);
        const lights = new Map(marked.map((status) => [status.tabId, status.light]));
        const statuses: ReturnType<typeof statusView>[] = [];
        for (const [tabId, tab] of byId) {
          const light = lights.get(tabId);
          if (light) {
            statuses.push(statusView({ tabId, light }, tab));
          }
        }
        return { statusCount: statuses.length, statuses };
      }

      case "setStatus": {
        for (const tabId of command.tabIds) {
          await services.statuses.setStatus(tabId, command.light);
        }
        return { tabIds: command.tabIds, color: command.light };
      }

      case "clearStatus": {
        const existing = new Set(
          (await services.statuses.getStatuses(command.tabIds)).map((status) => status.tabId),
        );
        for (const tabId of command.tabIds) {
          await services.statuses.setStatus(tabId, "none");
        }
        return {
          tabIds: command.tabIds,
          cleared: command.tabIds.filter((tabId) => existing.has(tabId)).length,
        };
      }

      case "detectForgeTabs": {
        const wanted = command.tabIds ? new Set(command.tabIds) : undefined;
        const tabs = (await workspace.listTabs()).filter(
          (tab) => wanted === undefined || (tab.id !== null && wanted.has(tab.id)),
        );
        const detections = await services.detectForgeLabels(tabs, {
          dryRun: command.dryRun ?? false,
        });
        return {
          dryRun: command.dryRun ?? false,
          scanned: tabs.length,
          found: detections.length,
          applied: detections.filter((detection) => detection.applied).length,
          tabs: detections,
        };
      }

      case "listSpaces":
        return workspace.listSpaces();

      case "listTabs": {
        const tabs = await workspace.listTabs();
        return withColors(tabs.filter((tab) => matchesListFilter(tab, command)).map(summarize));
      }

      case "listFolders":
        return workspace.listFolders();

      case "getSelectedTabs": {
        const tabs = await workspace.listSelectedTabs();
        return withColors(tabs.map(summarize));
      }

      case "activateTab":
        await workspace.activateTab(command.tabId);
        return { tabId: command.tabId };

      case "switchSpace":
        await workspace.switchSpace(command.spaceId);
        return { spaceId: command.spaceId };

      case "renameTab": {
        const renamed = await workspace.setLabel(command.label.trim(), command.tabId, true);
        if (!renamed) {
          throw new Error(`Tab ${command.tabId} could not be renamed.`);
        }
        return { tabId: command.tabId, label: command.label.trim() };
      }

      case "createFolder": {
        const folderId = await workspace.createFolder(
          command.name,
          command.spaceId,
          command.tabIds ?? [],
          command.parentId,
        );
        return { folderId };
      }

      case "createSpace": {
        const spaceId = await workspace.createSpace(command.name);
        return { spaceId, name: command.name };
      }

      case "renameSpace":
        await workspace.renameSpace(command.spaceId, command.name);
        return { spaceId: command.spaceId, name: command.name };

      case "moveFolder":
        await workspace.moveFolder(command.folderId, {
          spaceId: command.spaceId,
          parentId: command.parentId,
          afterFolderId: command.afterFolderId,
        });
        return {
          folderId: command.folderId,
          spaceId: command.spaceId,
          parentId: command.parentId ?? null,
        };

      case "deleteFolder":
        await workspace.deleteFolders(command.folderIds);
        return { folderIds: command.folderIds, deleted: command.folderIds.length };

      case "deleteSpace":
        await workspace.deleteSpaces(command.spaceIds);
        return { spaceIds: command.spaceIds, deleted: command.spaceIds.length };

      case "setEssential":
        await workspace.setEssential(command.tabIds);
        return { tabIds: command.tabIds, essential: true };

      case "clearEssential":
        await workspace.clearEssential(command.tabIds);
        return { tabIds: command.tabIds, essential: false };

      case "closeTab":
        await workspace.closeTabs(command.tabIds);
        return { tabIds: command.tabIds, closed: command.tabIds.length };

      case "renameFolder":
        await workspace.renameFolder(command.folderId, command.name);
        return { folderId: command.folderId, name: command.name };

      case "moveTabsToFolder": {
        const moved = await workspace.moveTabsToFolder(command.tabIds, command.folderId);
        return { moved, folderId: command.folderId };
      }

      case "removeTabsFromFolder": {
        const removed = await workspace.removeTabsFromFolder(command.tabIds);
        return { removed };
      }

      case "moveTabsToSpace": {
        const moved = await workspace.moveTabsToSpace(command.tabIds, command.spaceId);
        return { moved, spaceId: command.spaceId };
      }

      case "moveTabBefore":
        await workspace.moveTab(command.tabId, { beforeTabId: command.targetTabId });
        return { tabId: command.tabId, targetTabId: command.targetTabId, position: "before" };

      case "moveTabAfter":
        await workspace.moveTab(command.tabId, { afterTabId: command.targetTabId });
        return { tabId: command.tabId, targetTabId: command.targetTabId, position: "after" };

      case "openTab":
        return openTab(workspace, command, pendingUrls);
    }
  };
}
