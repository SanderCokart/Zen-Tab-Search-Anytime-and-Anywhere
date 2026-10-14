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

  it("marks a tab as todo and saves it in the tab session", async () => {
    const values = stubSessions();
    const service = createTodoService();

    await service.setTodo(1, "todo");

    await expect(service.getTodos([1, 2])).resolves.toEqual([{ tabId: 1, status: "todo" }]);
    expect(values.get(1)).toBe("todo");
  });

  it("removes the todo when it is marked done", async () => {
    const values = stubSessions();
    const service = createTodoService();

    await service.setTodo(1, "todo");
    await service.setTodo(1, "none");

    await expect(service.getTodos([1])).resolves.toEqual([]);
    expect(values.has(1)).toBe(false);
  });

  it("reads saved todos, including ones saved with a status color by an earlier build", async () => {
    stubSessions({ 1: "todo", 2: { status: "todo", light: "red" }, 3: "bogus" });
    const service = createTodoService();

    await expect(service.getTodos([1, 2, 3])).resolves.toEqual([
      { tabId: 1, status: "todo" },
      { tabId: 2, status: "todo" },
    ]);
  });

  it("forgets a closed tab's todo", async () => {
    const service = createTodoService();
    await service.setTodo(1, "todo");
    service.forget(1);
    stubSessions();

    await expect(service.getTodos([1])).resolves.toEqual([]);
  });

  it("rejects an invalid tab ID", async () => {
    await expect(createTodoService().setTodo(-1, "todo")).rejects.toThrow("Invalid tab ID.");
  });
});
