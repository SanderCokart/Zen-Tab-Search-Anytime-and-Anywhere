import type { WorkspaceAdapter } from "@/features/zen/adapter";
import type { ForgeDetection } from "@/features/forge/background/label-command";
import { isAllowedTimerEnd, parseTimerInput } from "@/features/timers/model/timer";
import type { BridgeCommand, TabSummary } from "@/shared/messaging/bridge-protocol";
import { isUsableTabId, type TabInfo, type TabTimer, type TabTodo, type TodoStatus } from "@/shared/types";

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
  | "getTab"
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

/** Everything beyond the Zen workspace that a bridge command may need. */
export interface BridgeServices {
  timers: BridgeTimers;
  todos: BridgeTodos;
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
        return timerView(await services.timers.setTabTimer(command.tabId, endAt));
      }

      case "clearTimer": {
        const cleared = await services.timers.clearTabTimer(command.tabId);
        return { tabId: command.tabId, cleared };
      }

      case "listTodos": {
        const tabs = await workspace.listTabs();
        const byId = new Map(
          tabs.flatMap((tab) => (isUsableTabId(tab.id) ? [[tab.id, tab] as const] : [])),
        );
        const marked = await services.todos.getTodos([...byId.keys()]);
        const statusById = new Map(marked.map((todo) => [todo.tabId, todo.status]));
        const todo = [];
        const done = [];
        for (const [tabId, tab] of byId) {
          const status = statusById.get(tabId);
          if (status === "todo") {
            todo.push(todoView({ tabId, status }, tab));
          } else if (status === "done") {
            done.push(todoView({ tabId, status }, tab));
          }
        }
        return { todoCount: todo.length, doneCount: done.length, todo, done };
      }

      case "setTodo": {
        await services.todos.setTodo(command.tabId, command.status);
        return { tabId: command.tabId, status: command.status };
      }

      case "clearTodo": {
        const existing = await services.todos.getTodos([command.tabId]);
        await services.todos.setTodo(command.tabId, "none");
        return { tabId: command.tabId, cleared: existing.length > 0 };
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
        return tabs.filter((tab) => matchesListFilter(tab, command)).map(summarize);
      }

      case "listFolders":
        return workspace.listFolders();

      case "getSelectedTabs": {
        const tabs = await workspace.listSelectedTabs();
        return tabs.map(summarize);
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
        );
        return { folderId };
      }

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
