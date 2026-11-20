import { afterEach, describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import { createTabSessionValues } from "@/shared/tab-session-values";

/** Stubs `browser.sessions` with a getTabValue that resolves after a tick, so reads overlap. */
function stubSessions(initial: Record<number, unknown>) {
  const getTabValue = vi.fn(async (tabId: number) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return initial[tabId];
  });
  Object.assign(globalThis, {
    browser: {
      sessions: {
        getTabValue,
        setTabValue: vi.fn(async () => undefined),
        removeTabValue: vi.fn(async () => undefined),
      },
    },
  });
  return getTabValue;
}

describe("createTabSessionValues", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "browser");
  });

  it("reads a tab's session once when two hydrations overlap", async () => {
    const getTabValue = stubSessions({ 1: "todo" });
    const values = createTabSessionValues("tabTodo", v.string());

    await Promise.all([values.hydrate([1]), values.hydrate([1])]);

    expect(getTabValue).toHaveBeenCalledTimes(1);
    await expect(values.get([1])).resolves.toEqual([{ tabId: 1, value: "todo" }]);
  });

  it("reads each tab once across overlapping calls that name different tabs", async () => {
    const getTabValue = stubSessions({ 1: "todo", 2: "todo" });
    const values = createTabSessionValues("tabTodo", v.string());

    await Promise.all([values.hydrate([1, 2]), values.hydrate([2])]);
    await values.hydrate([1]);

    expect(getTabValue).toHaveBeenCalledTimes(2);
  });
});
