import * as v from "valibot";
import { debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { isUsableTabId, type TabTodo, type TodoStatus, type TrafficLight } from "@/shared/types";
import { TODO_STATUSES, TRAFFIC_LIGHTS } from "@/shared/messaging/protocol";

/**
 * A tab's todo lives in that tab's session data, like a timer. Session data
 * survives a Zen restart with the tab and disappears when the tab closes, so
 * nothing needs cleaning up. Without the sessions API the todos are kept in
 * memory and last only until the browser restarts.
 */
const TODO_SESSION_KEY = "tabTodo";
const todoStatusSchema = v.picklist(TODO_STATUSES);

type StoredTodo = Omit<TabTodo, "tabId">;

/**
 * What is saved in the session: a status and an optional traffic light. Todos
 * saved before lights existed hold the bare status string, so that still parses.
 */
const storedTodoSchema = v.union([
  v.pipe(
    todoStatusSchema,
    v.transform((status): StoredTodo => ({ status })),
  ),
  v.object({
    status: todoStatusSchema,
    light: v.optional(v.picklist(TRAFFIC_LIGHTS)),
  }),
]);

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
  const memory = new Map<number, StoredTodo>();
  const hydrated = new Set<number>();

  function peekTodos(tabIds: number[]): TabTodo[] {
    return tabIds.flatMap((tabId) => {
      const stored = memory.get(tabId);
      return stored ? [{ tabId, ...stored }] : [];
    });
  }

  async function hydrate(tabIds: number[]): Promise<void> {
    const missing = tabIds.filter((tabId) => !hydrated.has(tabId));
    if (missing.length === 0) {
      return;
    }

    await Promise.all(
      missing.map(async (tabId) => {
        try {
          const value = await getTabSessionStore()?.getTabValue(tabId, TODO_SESSION_KEY);
          const parsed = v.safeParse(storedTodoSchema, value);
          // A write that landed while the read was in flight is newer than the session.
          if (parsed.success && !memory.has(tabId)) {
            memory.set(tabId, parsed.output);
          }
        } catch {
          // The tab may already be gone; keep whatever is already in memory.
        }
        hydrated.add(tabId);
      }),
    );
  }

  /**
   * Sets a tab's todo, or removes it with "none". `light` sets the traffic
   * light, "none" clears it, and leaving it out keeps whatever the todo has.
   */
  async function setTodo(
    tabId: number,
    status: TodoStatus | "none",
    light?: TrafficLight | "none",
  ): Promise<void> {
    if (!isUsableTabId(tabId)) {
      throw new Error("Invalid tab ID.");
    }

    // Read any saved light first, so changing the status alone does not drop it.
    await hydrate([tabId]);
    hydrated.add(tabId);
    if (status === "none") {
      memory.delete(tabId);
      try {
        await getTabSessionStore()?.removeTabValue(tabId, TODO_SESSION_KEY);
      } catch {
        // The tab may already be gone.
      }
      return;
    }

    const nextLight = light === undefined ? memory.get(tabId)?.light : light;
    const next: StoredTodo =
      nextLight === undefined || nextLight === "none" ? { status } : { status, light: nextLight };
    memory.set(tabId, next);
    try {
      await getTabSessionStore()?.setTabValue(tabId, TODO_SESSION_KEY, next);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not persist todo to the tab session:`, formatError(error));
    }
  }

  /** The todo for each of these tabs that has one. Session reads happen once per tab. */
  async function getTodos(tabIds: number[]): Promise<TabTodo[]> {
    await hydrate(tabIds);
    return peekTodos(tabIds);
  }

  /** Drops the in-memory copy when a tab closes. Session data goes with the tab. */
  function forget(tabId: number): void {
    memory.delete(tabId);
    hydrated.delete(tabId);
  }

  return { setTodo, getTodos, hydrate, forget };
}

export type TodoService = ReturnType<typeof createTodoService>;
