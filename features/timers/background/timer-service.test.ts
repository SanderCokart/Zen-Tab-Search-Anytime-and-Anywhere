import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { createTimerService } from "@/features/timers/background/timer-service";

const NOW = 1_700_000_000_000;

function installBrowser(
  initialTimers: Record<string, unknown> = {},
  options: { openTabIds?: number[]; sessionTimers?: Record<number, unknown> } = {},
) {
  const storage: Record<string, unknown> = { tabTimers: initialTimers };
  const sessionTimers: Record<number, unknown> = { ...(options.sessionTimers ?? {}) };
  const openTabIds =
    options.openTabIds ?? Object.keys(initialTimers).map(Number).filter(Number.isFinite);
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
        getAll: vi.fn(async () => []),
      },
      notifications: {
        create: vi.fn(async () => undefined),
      },
      sessions: {
        getTabValue: vi.fn(async (tabId: number) => sessionTimers[tabId]),
        setTabValue: vi.fn(async (tabId: number, _key: string, value: unknown) => {
          sessionTimers[tabId] = value;
        }),
        removeTabValue: vi.fn(async (tabId: number) => {
          delete sessionTimers[tabId];
        }),
      },
      tabs: {
        get: vi.fn(async (tabId: number) => ({
          id: tabId,
          title: "Docs",
          url: "https://example.com",
        })),
        query: vi.fn(async () => openTabIds.map((id) => ({ id }))),
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
    sessionTimers,
    openTabIds,
    setLabel,
    getCustomTabLabels,
    service: createTimerService({ setLabel, getCustomTabLabels }),
  };
}

describe("createTimerService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("persists a new timer and lists it as active", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { service, storage, sessionTimers } = installBrowser({}, { openTabIds: [7] });
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
    expect(sessionTimers[7]).toEqual({ tabId: 7, endAt, originalLabel: "", title: "Docs" });
    await expect(service.getActiveTimers()).resolves.toEqual([
      { tabId: 7, endAt, originalLabel: "", title: "Docs" },
    ]);
  });

  it("ignores malformed stored timers when restoring", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { service, storage } = installBrowser(
      {
        bad: { tabId: "nope" },
        "4": { tabId: 4, endAt: NOW + 60_000, originalLabel: "⏱ 1m | Note", title: "Note" },
      },
      { openTabIds: [4] },
    );

    await service.restorePersistedTimers();
    expect(storage.tabTimers).toEqual({
      "4": { tabId: 4, endAt: NOW + 60_000, originalLabel: "Note", title: "Note" },
    });
  });

  it("keeps stored timers when the browser shuts down", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const endAt = NOW + 60_000;
    const timer = { tabId: 3, endAt, originalLabel: "", title: "Tab" };
    const { service, storage, sessionTimers } = installBrowser(
      { "3": timer },
      { openTabIds: [3], sessionTimers: { 3: timer } },
    );

    await service.handleTabRemoved(3, true);
    expect(storage.tabTimers).toEqual({ "3": timer });
    expect(sessionTimers[3]).toEqual(timer);
  });

  it("does not wipe stored timers if restore runs before tabs exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const timer = { tabId: 8, endAt: NOW + 60_000, originalLabel: "", title: "Tab" };
    const { service, storage } = installBrowser({ "8": timer }, { openTabIds: [] });

    await service.restorePersistedTimers();
    expect(storage.tabTimers).toEqual({ "8": timer });
  });

  it("retries restore until session tabs exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const timer = { tabId: 8, endAt: NOW + 60_000, originalLabel: "", title: "Tab" };
    const { service, storage } = installBrowser({ "8": timer }, { openTabIds: [] });
    const tabsQuery = vi.mocked(browser.tabs.query) as unknown as Mock;
    tabsQuery.mockResolvedValueOnce([]).mockResolvedValue([{ id: 8 }]);

    await service.restorePersistedTimers();
    expect(browser.alarms.create).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(storage.tabTimers).toEqual({ "8": timer });
    expect(browser.alarms.create).toHaveBeenCalledWith("tab-timer:8", { when: NOW + 60_000 });
  });

  it("rebinds a session timer onto a restored tab id", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const endAt = NOW + 60_000;
    const stored = { tabId: 1, endAt, originalLabel: "Note", title: "Docs" };
    const { service, storage, setLabel } = installBrowser(
      { "1": stored },
      {
        openTabIds: [42],
        sessionTimers: { 42: stored },
      },
    );

    await service.restorePersistedTimers();
    expect(storage.tabTimers).toEqual({
      "42": { tabId: 42, endAt, originalLabel: "Note", title: "Docs" },
    });
    await expect(service.getActiveTimers()).resolves.toEqual([
      { tabId: 42, endAt, originalLabel: "Note", title: "Docs" },
    ]);
    expect(setLabel).toHaveBeenCalled();
  });

  it("adopts a restored tab after startup when session restore is delayed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const endAt = NOW + 60_000;
    const stored = { tabId: 1, endAt, originalLabel: "Note", title: "Docs" };
    const { service, storage, openTabIds } = installBrowser(
      { "1": stored },
      { openTabIds: [], sessionTimers: { 99: stored } },
    );

    await service.restorePersistedTimers();
    openTabIds.push(99);
    await service.adoptRestoredTab(99);

    expect(storage.tabTimers).toEqual({
      "99": { tabId: 99, endAt, originalLabel: "Note", title: "Docs" },
    });
  });

  it("does not tick or list timers whose tabs are not open", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const live = { tabId: 5, endAt: NOW + 60_000, originalLabel: "", title: "Live" };
    const closed = { tabId: 6, endAt: NOW + 60_000, originalLabel: "", title: "Closed" };
    const expiredClosed = { tabId: 7, endAt: NOW - 1, originalLabel: "", title: "Expired" };
    const { service, storage, setLabel } = installBrowser(
      { "5": live, "6": closed, "7": expiredClosed },
      { openTabIds: [5] },
    );

    await expect(service.getActiveTimers()).resolves.toEqual([live]);
    await service.tickActiveTimers();

    expect(storage.tabTimers).toEqual({ "5": live, "6": closed, "7": expiredClosed });
    expect(setLabel).toHaveBeenCalledTimes(1);
    expect(setLabel).toHaveBeenCalledWith(expect.any(String), 5, true);
    expect(browser.notifications.create).not.toHaveBeenCalled();
  });

  it("does not process stored timers when no tabs are open yet", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const pending = { tabId: 8, endAt: NOW + 60_000, originalLabel: "", title: "Pending" };
    const expired = { tabId: 9, endAt: NOW - 1, originalLabel: "", title: "Expired" };
    const { service, storage, setLabel } = installBrowser(
      { "8": pending, "9": expired },
      { openTabIds: [] },
    );

    await expect(service.getActiveTimers()).resolves.toEqual([]);
    await service.tickActiveTimers();

    expect(storage.tabTimers).toEqual({ "8": pending, "9": expired });
    expect(setLabel).not.toHaveBeenCalled();
    expect(browser.notifications.create).not.toHaveBeenCalled();
  });

  it("clears a stored timer", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const endAt = NOW + 60_000;
    const { service } = installBrowser(
      {
        "3": { tabId: 3, endAt, originalLabel: "", title: "Tab" },
      },
      { openTabIds: [3] },
    );

    await expect(service.clearTabTimer(3)).resolves.toBe(true);
    await expect(service.getActiveTimers()).resolves.toEqual([]);
  });

  it("renames a tab without a timer", async () => {
    const { service, setLabel } = installBrowser({}, { openTabIds: [4] });
    await expect(service.renameTab(4, "  Docs  ")).resolves.toBe(true);
    expect(setLabel).toHaveBeenCalledWith("Docs", 4, false);
  });

  it("renames a timed tab and keeps the timer prefix", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const endAt = NOW + 60_000;
    const { service, storage, setLabel } = installBrowser(
      {
        "4": { tabId: 4, endAt, originalLabel: "Old", title: "Docs" },
      },
      { openTabIds: [4] },
    );

    await expect(service.renameTab(4, "New")).resolves.toBe(true);
    expect(setLabel).toHaveBeenCalledWith(expect.stringContaining("New"), 4, true);
    expect(storage.tabTimers).toEqual({
      "4": { tabId: 4, endAt, originalLabel: "New", title: "Docs" },
    });
  });
});
