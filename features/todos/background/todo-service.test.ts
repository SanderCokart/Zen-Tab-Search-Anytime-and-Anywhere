import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTodoService } from "@/features/todos/background/todo-service";

/** A stand-in for `browser.sessions`, holding whatever the service saves per tab. */
function stubSessions(initial: Record<number, unknown> = {}) {
  const values = new Map<number, unknown>(
    Object.entries(initial).map(([id, value]) => [Number(id), value]),
  );
  Object.assign(globalThis, {
    browser: {
      sessions: {
        getTabValue: vi.fn(async (tabId: number) => values.get(tabId)),
        setTabValue: vi.fn(async (tabId: number, _key: string, value: unknown) => {
          values.set(tabId, value);
        }),
        removeTabValue: vi.fn(async (tabId: number) => {
          values.delete(tabId);
        }),
      },
    },
  });
  return values;
}

describe("todo service", () => {
  beforeEach(() => {
    stubSessions();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "browser");
  });

  it("marks a tab as todo with no traffic light", async () => {
    const service = createTodoService();
    await service.setTodo(1, "todo");
    await expect(service.getTodos([1, 2])).resolves.toEqual([{ tabId: 1, status: "todo" }]);
  });

  it("sets and changes the traffic light, and persists it in the tab session", async () => {
    const values = stubSessions();
    const service = createTodoService();

    await service.setTodo(1, "todo", "red");
    await service.setTodo(1, "todo", "green");

    await expect(service.getTodos([1])).resolves.toEqual([
      { tabId: 1, status: "todo", light: "green" },
    ]);
    expect(values.get(1)).toEqual({ status: "todo", light: "green" });
  });

  it("keeps the light when the todo is marked again without one, and drops it on none", async () => {
    const service = createTodoService();

    await service.setTodo(1, "todo", "orange");
    await service.setTodo(1, "todo");
    await expect(service.getTodos([1])).resolves.toEqual([
      { tabId: 1, status: "todo", light: "orange" },
    ]);

    await service.setTodo(1, "todo", "none");
    await expect(service.getTodos([1])).resolves.toEqual([{ tabId: 1, status: "todo" }]);
  });

  it("forgets the light along with the todo when it is marked done", async () => {
    const service = createTodoService();
    await service.setTodo(1, "todo", "red");
    await service.setTodo(1, "none");
    await service.setTodo(1, "todo");

    await expect(service.getTodos([1])).resolves.toEqual([{ tabId: 1, status: "todo" }]);
  });

  it("reads a light saved in the session, and a todo saved before lights existed", async () => {
    stubSessions({ 1: { status: "todo", light: "red" }, 2: "todo", 3: "bogus" });
    const service = createTodoService();

    await expect(service.getTodos([1, 2, 3])).resolves.toEqual([
      { tabId: 1, status: "todo", light: "red" },
      { tabId: 2, status: "todo" },
    ]);
  });

  it("rejects an invalid tab ID", async () => {
    await expect(createTodoService().setTodo(-1, "todo")).rejects.toThrow("Invalid tab ID.");
  });
});
