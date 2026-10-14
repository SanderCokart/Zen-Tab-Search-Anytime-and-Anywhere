import { afterEach, describe, expect, it, vi } from "vitest";
import { createStatusService } from "@/features/status/background/status-service";

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

describe("status service", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "browser");
  });

  it("sets and changes a tab's status color and saves it in the tab session", async () => {
    const values = stubSessions();
    const service = createStatusService();

    await service.setStatus(1, "red");
    await service.setStatus(1, "green");

    await expect(service.getStatuses([1, 2])).resolves.toEqual([{ tabId: 1, light: "green" }]);
    expect(values.get(1)).toBe("green");
  });

  it("clears the color with none", async () => {
    const values = stubSessions();
    const service = createStatusService();

    await service.setStatus(1, "orange");
    await service.setStatus(1, "none");

    await expect(service.getStatuses([1])).resolves.toEqual([]);
    expect(values.has(1)).toBe(false);
  });

  it("reads colors saved in the session and ignores anything else", async () => {
    stubSessions({ 1: "red", 2: "purple", 3: { light: "green" } });
    const service = createStatusService();

    await expect(service.getStatuses([1, 2, 3])).resolves.toEqual([{ tabId: 1, light: "red" }]);
  });

  it("keeps a color set while the session read was still in flight", async () => {
    let release: (value: unknown) => void = () => undefined;
    Object.assign(globalThis, {
      browser: {
        sessions: {
          getTabValue: vi.fn(() => new Promise((resolve) => (release = resolve))),
          setTabValue: vi.fn(async () => undefined),
          removeTabValue: vi.fn(async () => undefined),
        },
      },
    });
    const service = createStatusService();

    const reading = service.hydrate([1]);
    await service.setStatus(1, "green");
    release("red");
    await reading;

    await expect(service.getStatuses([1])).resolves.toEqual([{ tabId: 1, light: "green" }]);
  });

  it("rejects an invalid tab ID", async () => {
    stubSessions();
    await expect(createStatusService().setStatus(-1, "red")).rejects.toThrow("Invalid tab ID.");
  });
});
