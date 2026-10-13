import * as v from "valibot";
import { debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { isUsableTabId, type TabTodo, type TodoStatus } from "@/shared/types";
import { TODO_STATUSES } from "@/shared/messaging/protocol";

/**
 * A tab's todo lives in that tab's session data, like a timer. Session data
 * survives a Zen restart with the tab and disappears when the tab closes, so
 * nothing needs cleaning up. Without the sessions API the todos are kept in
 * memory and last only until the browser restarts.
 */
const TODO_SESSION_KEY = "tabTodo";
const todoStatusSchema = v.picklist(TODO_STATUSES);

interface TabSessionStore {
  getTabValue(tabId: number, key: string): Promise<unknown>;
  setTabValue(tabId: number, key: string, value: unknown): Promise<void>;
  removeTabValue(tabId: number, key: string): Promise<void>;
}

function getTabSessionStore(): TabSessionStore | undefined {
  const sessions = (browser as typeof browser & { sessions?: Partial<TabSessionStore> }).sessions;
  if (!sessions?.getTabValue || !sessions.setTabValue || !sessions.removeTabValue) {
    return undefined;
  }
  return sessions as TabSessionStore;
}

export function createTodoService() {
  const memory = new Map<number, TodoStatus>();

  async function readTodo(tabId: number): Promise<TodoStatus | undefined> {
    try {
      const value = await getTabSessionStore()?.getTabValue(tabId, TODO_SESSION_KEY);
      const parsed = v.safeParse(todoStatusSchema, value);
      if (parsed.success) {
        return parsed.output;
      }
    } catch {
      // The tab may already be gone; fall through to the in-memory copy.
    }
    return memory.get(tabId);
  }

  /** Sets a tab's todo, or removes it with "none". */
  async function setTodo(tabId: number, status: TodoStatus | "none"): Promise<void> {
    if (!isUsableTabId(tabId)) {
      throw new Error("Invalid tab ID.");
    }

    if (status === "none") {
      memory.delete(tabId);
      try {
        await getTabSessionStore()?.removeTabValue(tabId, TODO_SESSION_KEY);
      } catch {
        // The tab may already be gone.
      }
      return;
    }

    memory.set(tabId, status);
    try {
      await getTabSessionStore()?.setTabValue(tabId, TODO_SESSION_KEY, status);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not persist todo to the tab session:`, formatError(error));
    }
  }

  /** The todo for each of these tabs that has one. */
  async function getTodos(tabIds: number[]): Promise<TabTodo[]> {
    const statuses = await Promise.all(tabIds.map((tabId) => readTodo(tabId)));
    return tabIds.flatMap((tabId, index) => {
      const status = statuses[index];
      return status ? [{ tabId, status }] : [];
    });
  }

  /** Drops the in-memory copy when a tab closes. Session data goes with the tab. */
  function forget(tabId: number): void {
    memory.delete(tabId);
  }

  return { setTodo, getTodos, forget };
}

export type TodoService = ReturnType<typeof createTodoService>;
