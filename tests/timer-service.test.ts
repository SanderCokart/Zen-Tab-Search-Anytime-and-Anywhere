import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimerService } from "../lib/background/timer-service";

const NOW = 1_700_000_000_000;

function installBrowser(initialTimers: Record<string, unknown> = {}) {
  const storage: Record<string, unknown> = { tabTimers: initialTimers };
  const setLabel = vi.fn(async () => true);
  const getCustomTabLabels = vi.fn(async () => ({}) as Record<number, string>);

  Object.assign(globalThis, {
    browser: {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            Object.assign(storage, value);
          }),
        },
      },
      alarms: {
        clear: vi.fn(async () => true),
        create: vi.fn(async () => undefined),
      },
      notifications: {
        create: vi.fn(async () => undefined),
      },
      tabs: {
        get: vi.fn(async (tabId: number) => ({
          id: tabId,
          title: "Docs",
          url: "https://example.com",
        })),
      },
      runtime: {
        getURL: (path: string) => path,
      },
      browserAction: {
        setBadgeText: vi.fn(async () => undefined),
      },
    },
  });

  return {
    storage,
    setLabel,
    getCustomTabLabels,
    service: createTimerService({ setLabel, getCustomTabLabels }),
  };
}

describe("createTimerService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists a new timer and lists it as active", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { service, storage } = installBrowser();
    const endAt = NOW + 30 * 60_000;

    await expect(service.setTabTimer(7, endAt)).resolves.toEqual({
      tabId: 7,
      endAt,
      originalLabel: "",
      title: "Docs",
    });
    expect(storage.tabTimers).toEqual({
      "7": { tabId: 7, endAt, originalLabel: "", title: "Docs" },
    });
    await expect(service.getActiveTimers()).resolves.toEqual([
      { tabId: 7, endAt, originalLabel: "", title: "Docs" },
    ]);
  });

  it("ignores malformed stored timers when restoring", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { service, storage } = installBrowser({
      bad: { tabId: "nope" },
      "4": { tabId: 4, endAt: NOW + 60_000, originalLabel: "⏱ 1m | Note", title: "Note" },
    });

    await service.restorePersistedTimers();
    expect(storage.tabTimers).toEqual({
      "4": { tabId: 4, endAt: NOW + 60_000, originalLabel: "Note", title: "Note" },
    });
  });

  it("clears a stored timer", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const endAt = NOW + 60_000;
    const { service } = installBrowser({
      "3": { tabId: 3, endAt, originalLabel: "", title: "Tab" },
    });

    await expect(service.clearTabTimer(3)).resolves.toBe(true);
    await expect(service.getActiveTimers()).resolves.toEqual([]);
  });
});
