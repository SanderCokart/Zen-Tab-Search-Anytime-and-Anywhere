import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimerService } from "@/features/timers/background/timer-service";

const NOW = 1_700_000_000_000;
const DOCS_URL = "https://example.com/docs";

function tabUrl(tabId: number): string {
  return `https://example.com/tab-${tabId}`;
}

/** A stored timer for the docs page, labelled "Note", one minute from NOW. */
function timer(timerId: string, tabId: number, overrides: Record<string, unknown> = {}) {
  return {
    timerId,
    tabId,
    endAt: NOW + 60_000,
    originalLabel: "Note",
    title: "Docs",
    url: DOCS_URL,
    ...overrides,
  };
}

function installBrowser(
  initialTimers: Record<string, unknown> = {},
  options: {
    openTabIds?: number[];
    sessionTimers?: Record<number, unknown>;
    labels?: Record<number, string>;
    urls?: Record<number, string>;
    /** Tabs in a space Zen has not opened, which Firefox's tabs.query leaves out. */
    otherSpaceTabIds?: number[];
  } = {},
) {
  const storage: Record<string, unknown> = { tabTimers: initialTimers };
  const sessionValues: Record<string, Record<number, unknown>> = {
    tabTimer: { ...(options.sessionTimers ?? {}) },
    tabTimerFired: {},
  };
  const sessionTimers = sessionValues.tabTimer as Record<number, unknown>;
  const firedMarkers = sessionValues.tabTimerFired as Record<number, unknown>;
  const openTabIds =
    options.openTabIds ?? Object.keys(initialTimers).map(Number).filter(Number.isFinite);
  // Zen's own tab labels, which survive a restart even on unloaded tabs.
  const labels: Record<number, string> = { ...(options.labels ?? {}) };
  const urls: Record<number, string> = { ...(options.urls ?? {}) };
  const urlOf = (tabId: number) => urls[tabId] ?? tabUrl(tabId);
  const setLabel = vi.fn(async (label: string, tabId: number) => {
    if (label) labels[tabId] = label;
    else delete labels[tabId];
    return true;
  });
  // Zen's own tab list, like the omnibar's: every space, with labels.
  const listTabs = vi.fn(async () =>
    openTabIds.map((id) => ({ id, title: "Docs", url: urlOf(id), customLabel: labels[id] ?? "" })),
  );
  const otherSpace = new Set(options.otherSpaceTabIds ?? []);

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
        getTabValue: vi.fn(async (tabId: number, key: string) => sessionValues[key]?.[tabId]),
        setTabValue: vi.fn(async (tabId: number, key: string, value: unknown) => {
          (sessionValues[key] ??= {})[tabId] = value;
        }),
        removeTabValue: vi.fn(async (tabId: number, key: string) => {
          delete sessionValues[key]?.[tabId];
        }),
      },
      tabs: {
        query: vi.fn(async () =>
          openTabIds.filter((id) => !otherSpace.has(id)).map((id) => ({ id, url: urlOf(id) })),
        ),
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
    firedMarkers,
    openTabIds,
    labels,
    urls,
    setLabel,
    listTabs,
    service: createTimerService({ setLabel, listTabs }),
  };
}

describe("createTimerService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("persists a new timer with its tab's url and lists it as active", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { service, storage, sessionTimers } = installBrowser({}, { openTabIds: [7] });
    const endAt = NOW + 30 * 60_000;
    const expected = {
      timerId: expect.any(String),
      tabId: 7,
      endAt,
      originalLabel: "",
      title: "Docs",
      url: tabUrl(7),
    };

    await expect(service.setTabTimer(7, endAt)).resolves.toEqual(expected);
    expect(storage.tabTimers).toEqual({ "7": expected });
    expect(sessionTimers[7]).toEqual(expected);
    await expect(service.getActiveTimers()).resolves.toEqual([expected]);
  });

  it("ignores malformed stored timers when restoring", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const stored = timer("t4", 4, { originalLabel: "⏱ 1m | Note" });
    const { service, storage } = installBrowser(
      { bad: { tabId: "nope" }, "4": stored },
      { openTabIds: [4], sessionTimers: { 4: stored }, urls: { 4: DOCS_URL } },
    );

    await service.restorePersistedTimers();
    expect(storage.tabTimers).toEqual({ "4": { ...stored, originalLabel: "Note" } });
  });

  it("keeps a timer when the browser shuts down", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { service, storage, sessionTimers } = installBrowser({}, { openTabIds: [3] });
    const set = await service.setTabTimer(3, NOW + 60_000);

    await service.handleTabRemoved(3, true);
    expect(storage.tabTimers).toEqual({ "3": set });
    expect(sessionTimers[3]).toEqual(set);
  });

  it("does not lose stored timers if restore runs before tabs exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const stored = timer("t8", 8);
    const { service, storage } = installBrowser({ "8": stored }, { openTabIds: [] });

    await service.restorePersistedTimers();
    expect(storage.unmatchedTabTimers).toEqual({ t8: stored });
  });

  it("retries restore until tabs exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const stored = timer("t8", 8);
    const { service, storage, listTabs } = installBrowser(
      { "8": stored },
      { openTabIds: [], sessionTimers: { 8: stored } },
    );
    listTabs
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 8, title: "Docs", url: DOCS_URL, customLabel: "" }]);

    await service.restorePersistedTimers();
    expect(browser.alarms.create).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(storage.tabTimers).toEqual({ "8": stored });
    expect(browser.alarms.create).toHaveBeenCalledWith("tab-timer:8", { when: NOW + 60_000 });
  });

  describe("matching a restored tab to its timer", () => {
    it("matches on stored timer data and url", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const stored = timer("t1", 1);
      const { service, storage, setLabel } = installBrowser(
        { "1": stored },
        { openTabIds: [42], sessionTimers: { 42: stored }, urls: { 42: DOCS_URL } },
      );

      await service.restorePersistedTimers();
      expect(storage.tabTimers).toEqual({ "42": { ...stored, tabId: 42 } });
      expect(setLabel).toHaveBeenCalledWith(expect.stringContaining("Note"), 42, true);
    });

    it("matches an unloaded tab without stored data on its url and ⏱ label", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const stored = timer("t1", 12);
      const { service, storage } = installBrowser(
        { "12": stored },
        { openTabIds: [12, 40], urls: { 40: DOCS_URL }, labels: { 40: "⏱ 3m | Note" } },
      );

      await service.restorePersistedTimers();
      expect(storage.tabTimers).toEqual({ "40": { ...stored, tabId: 40 } });
    });

    it("finds a tab in a space Firefox's tab list leaves out", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const stored = timer("t1", 12);
      const { service, storage, labels } = installBrowser(
        { "12": stored },
        {
          openTabIds: [2, 74],
          otherSpaceTabIds: [74],
          urls: { 74: DOCS_URL },
          labels: { 74: "⏱ 51s | Note" },
        },
      );

      await service.restorePersistedTimers();
      expect(storage.tabTimers).toEqual({ "74": { ...stored, tabId: 74 } });
      await expect(service.getActiveTimers()).resolves.toEqual([{ ...stored, tabId: 74 }]);
      expect(labels[74]).toMatch(/^⏱ 1m .*\| Note$/);
    });

    it("cleans a stale ⏱ label in a space Firefox's tab list leaves out", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { service, labels } = installBrowser(
        {},
        { openTabIds: [2, 74], otherSpaceTabIds: [74], labels: { 74: "⏱ 51s | Hetzner" } },
      );

      await service.restorePersistedTimers();
      expect(labels[74]).toBe("Hetzner");
    });

    it("picks the tab whose ⏱ label names the timer among tabs with the same url", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const stored = timer("t1", 3);
      const { service, storage } = installBrowser(
        { "3": stored },
        {
          openTabIds: [15, 16],
          urls: { 15: DOCS_URL, 16: DOCS_URL },
          labels: { 15: "⏱ 3m | Other", 16: "⏱ 3m | Note" },
        },
      );

      await service.restorePersistedTimers();
      expect(storage.tabTimers).toEqual({ "16": { ...stored, tabId: 16 } });
    });

    it("needs two of timer data, url and label to agree", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const byUrl = timer("url-only", 1, { title: "A", originalLabel: "A" });
      const byData = timer("data-only", 2, { url: "https://example.com/moved" });
      const byLabel = timer("label-only", 3, { originalLabel: "C", url: "https://example.com/c" });
      const { service, storage } = installBrowser(
        { "1": byUrl, "2": byData, "3": byLabel },
        {
          openTabIds: [10, 11, 12],
          urls: { 10: DOCS_URL },
          sessionTimers: { 11: byData },
          labels: { 12: "⏱ 3m | C" },
        },
      );

      await service.restorePersistedTimers();
      expect(storage.tabTimers).toEqual({});
    });

    it("does not give a timer to a new tab that reuses the old tab id", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const stored = timer("t1", 12);
      const { service, storage, setLabel } = installBrowser(
        { "12": stored },
        { openTabIds: [12, 40], sessionTimers: { 40: stored }, urls: { 40: DOCS_URL } },
      );

      await service.restorePersistedTimers();

      expect(storage.tabTimers).toEqual({ "40": { ...stored, tabId: 40 } });
      expect(setLabel).not.toHaveBeenCalledWith(expect.anything(), 12, true);
    });

    it("adopts a tab created after startup", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const stored = timer("t1", 1);
      const { service, storage, openTabIds, urls, labels } = installBrowser(
        { "1": stored },
        { openTabIds: [] },
      );

      await service.restorePersistedTimers();
      openTabIds.push(99);
      urls[99] = DOCS_URL;
      labels[99] = "⏱ 1m | Note";
      await service.adoptRestoredTab(99);

      expect(storage.tabTimers).toEqual({ "99": { ...stored, tabId: 99 } });
      expect(storage.unmatchedTabTimers).toEqual({});
    });

    it("does not let a duplicated tab take the timer from its original", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { service, storage, sessionTimers, openTabIds, urls, labels } = installBrowser(
        {},
        { openTabIds: [5] },
      );
      const set = await service.setTabTimer(5, NOW + 60_000);

      openTabIds.push(6);
      urls[6] = tabUrl(5);
      labels[6] = labels[5]!;
      sessionTimers[6] = set;
      await service.adoptRestoredTab(6);

      expect(storage.tabTimers).toEqual({ "5": set });
      expect(sessionTimers[6]).toBeUndefined();
    });
  });

  it("does not tick or list timers whose tabs are not open", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const live = timer("a", 5);
    const closed = timer("b", 6, { url: "https://example.com/closed" });
    const { service, storage, setLabel } = installBrowser(
      { "5": live, "6": closed },
      { openTabIds: [5], sessionTimers: { 5: live }, urls: { 5: DOCS_URL } },
    );

    await service.restorePersistedTimers();
    await expect(service.getActiveTimers()).resolves.toEqual([live]);
    await service.tickActiveTimers();

    expect(storage.tabTimers).toEqual({ "5": live });
    expect(storage.unmatchedTabTimers).toEqual({ b: closed });
    expect(setLabel).toHaveBeenCalledTimes(1);
    expect(setLabel).toHaveBeenCalledWith(expect.any(String), 5, true);
    expect(browser.notifications.create).not.toHaveBeenCalled();
  });

  it("does not process stored timers when no tabs are open yet", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const pending = timer("p", 8);
    const expired = timer("e", 9, { endAt: NOW - 1 });
    const { service, storage, setLabel } = installBrowser(
      { "8": pending, "9": expired },
      { openTabIds: [] },
    );

    await expect(service.getActiveTimers()).resolves.toEqual([]);
    await service.tickActiveTimers();

    expect(storage.unmatchedTabTimers).toEqual({ p: pending, e: expired });
    expect(setLabel).not.toHaveBeenCalled();
    expect(browser.notifications.create).not.toHaveBeenCalled();
  });

  it("keeps the timer's url current while the tab browses", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { service, storage, urls } = installBrowser({}, { openTabIds: [7] });
    const set = await service.setTabTimer(7, NOW + 60_000);

    urls[7] = "https://example.com/next";
    await service.tickActiveTimers();

    expect(storage.tabTimers).toEqual({ "7": { ...set, url: "https://example.com/next" } });
  });

  describe("timers whose tab does not come back", () => {
    it("reports a due timer as soon as restore has seen the tabs", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const lost = timer("lost", 3, { endAt: NOW - 1, originalLabel: "Report" });
      const { service, storage } = installBrowser({ "3": lost }, { openTabIds: [20] });

      await service.restorePersistedTimers();

      expect(browser.notifications.create).toHaveBeenCalledTimes(1);
      expect(browser.notifications.create).toHaveBeenCalledWith(
        "tab-timer-missing-lost",
        expect.objectContaining({
          title: "Tab timer finished, original tab not found",
          message: "Report",
        }),
      );
      expect(storage.unmatchedTabTimers).toEqual({});
    });

    it("waits for a timer that has not finished yet", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(NOW);
      const later = timer("later", 3);
      const { service } = installBrowser({ "3": later }, { openTabIds: [20] });

      await service.restorePersistedTimers();
      await service.tickActiveTimers();
      expect(browser.notifications.create).not.toHaveBeenCalled();

      now.mockReturnValue(NOW + 60_000);
      await service.tickActiveTimers();
      expect(browser.notifications.create).toHaveBeenCalledWith(
        "tab-timer-missing-later",
        expect.anything(),
      );
    });

    it("strips ⏱ prefixes from tabs without a timer on every restore", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { service, setLabel, labels } = installBrowser(
        {},
        { openTabIds: [1, 2], labels: { 1: "⏱ 5m | Notes", 2: "Plain" } },
      );

      await service.restorePersistedTimers();
      labels[2] = "⏱ 1m";
      await service.restorePersistedTimers();

      expect(setLabel).toHaveBeenCalledTimes(2);
      expect(setLabel).toHaveBeenCalledWith("Notes", 1, true);
      expect(setLabel).toHaveBeenCalledWith("", 2, true);
    });

    it("links a tab that turns up after the report to the not-found notice", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const lost = timer("lost", 3, { endAt: NOW - 1 });
      const { service, storage, openTabIds, urls, labels } = installBrowser(
        { "3": lost },
        { openTabIds: [20] },
      );

      await service.restorePersistedTimers();
      openTabIds.push(21);
      urls[21] = DOCS_URL;
      labels[21] = "⏱ 1m | Note";
      await service.adoptRestoredTab(21);

      expect(storage.tabTimers).toEqual({});
      expect(labels[21]).toBe("Note");
      await expect(service.resolveNotificationClick("tab-timer-missing-lost")).resolves.toEqual({
        kind: "tab",
        tabId: 21,
      });
    });

    it("looks for the tab again when the not-found notice is clicked", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const lost = timer("lost", 3, { endAt: NOW - 1 });
      const { service, openTabIds, urls, labels } = installBrowser(
        { "3": lost },
        { openTabIds: [20] },
      );

      await service.restorePersistedTimers();
      openTabIds.push(21);
      urls[21] = DOCS_URL;
      labels[21] = "⏱ 1m | Note";

      await expect(service.resolveNotificationClick("tab-timer-missing-lost")).resolves.toEqual({
        kind: "tab",
        tabId: 21,
      });
      expect(labels[21]).toBe("Note");
    });

    it("searches for the tab by name when the not-found notice finds nothing", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const lost = timer("lost", 3, { endAt: NOW - 1 });
      const { service } = installBrowser({ "3": lost }, { openTabIds: [20] });

      await service.restorePersistedTimers();

      await expect(service.resolveNotificationClick("tab-timer-missing-lost")).resolves.toEqual({
        kind: "search",
        query: "Note",
      });
    });
  });

  describe("notification clicks", () => {
    async function finishedTimer(openTabIds = [5]) {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const setup = installBrowser({}, { openTabIds });
      const set = await setup.service.setTabTimer(5, NOW + 60_000);
      await setup.service.renameTab(5, "Review");
      await setup.service.finishTimer(5, true);
      return { ...setup, timer: set, notificationId: `tab-timer-${set.timerId}` };
    }

    it("opens the tab whose timer finished", async () => {
      const { service, notificationId } = await finishedTimer();
      expect(browser.notifications.create).toHaveBeenCalledWith(notificationId, expect.anything());

      await expect(service.resolveNotificationClick(notificationId)).resolves.toEqual({
        kind: "tab",
        tabId: 5,
      });
    });

    it("finds the tab by its mark after its id changed", async () => {
      const { service, notificationId, firedMarkers, openTabIds } = await finishedTimer([5]);
      firedMarkers[30] = firedMarkers[5];
      delete firedMarkers[5];
      openTabIds.splice(0, openTabIds.length, 30);

      await expect(service.resolveNotificationClick(notificationId)).resolves.toEqual({
        kind: "tab",
        tabId: 30,
      });
    });

    it("finds an unloaded tab without its mark by url and name", async () => {
      const { service, notificationId, firedMarkers, openTabIds, urls, labels } =
        await finishedTimer([5]);
      delete firedMarkers[5];
      openTabIds.splice(0, openTabIds.length, 30, 31);
      urls[30] = tabUrl(5);
      urls[31] = tabUrl(5);
      labels[31] = "Review";

      await expect(service.resolveNotificationClick(notificationId)).resolves.toEqual({
        kind: "tab",
        tabId: 31,
      });
    });

    it("opens the only tab with the timer's url when nothing else is left", async () => {
      const { service, notificationId, firedMarkers, openTabIds, urls } = await finishedTimer([5]);
      delete firedMarkers[5];
      openTabIds.splice(0, openTabIds.length, 30);
      urls[30] = tabUrl(5);

      await expect(service.resolveNotificationClick(notificationId)).resolves.toEqual({
        kind: "tab",
        tabId: 30,
      });
    });

    it("opens a tab that moved to a space Firefox's tab list leaves out", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const setup = installBrowser({}, { openTabIds: [2, 74], otherSpaceTabIds: [74] });
      const set = await setup.service.setTabTimer(74, NOW + 60_000);
      await setup.service.finishTimer(74, true);
      delete setup.firedMarkers[74];

      await expect(
        setup.service.resolveNotificationClick(`tab-timer-${set.timerId}`),
      ).resolves.toEqual({ kind: "tab", tabId: 74 });
    });

    it("does not open a different tab that now has the old id", async () => {
      const { service, notificationId, firedMarkers, timer: set, urls } = await finishedTimer([5]);
      delete firedMarkers[5];
      urls[5] = "https://example.com/someone-else";

      await expect(service.resolveNotificationClick(notificationId)).resolves.toBeUndefined();
      expect(browser.notifications.create).toHaveBeenLastCalledWith(
        `tab-timer-missing-${set.timerId}`,
        expect.objectContaining({ title: "Couldn't find the original tab", message: "Review" }),
      );

      await expect(
        service.resolveNotificationClick(`tab-timer-missing-${set.timerId}`),
      ).resolves.toEqual({ kind: "search", query: "Review" });
    });

    it("ignores notifications it has no record of", async () => {
      const { service } = installBrowser({}, { openTabIds: [5] });
      await expect(service.resolveNotificationClick("tab-timer-5")).resolves.toBeUndefined();
      await expect(service.resolveNotificationClick("host-override:5:x")).resolves.toBeUndefined();
    });
  });

  it("binds a timer saved before timer ids existed and gives it an id", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const legacy = { tabId: 12, endAt: NOW + 60_000, originalLabel: "Note", title: "Docs" };
    const { service, storage, sessionTimers } = installBrowser(
      { "12": legacy },
      { openTabIds: [12, 40], sessionTimers: { 40: legacy }, labels: { 40: "⏱ 1m | Note" } },
    );

    await service.restorePersistedTimers();

    const bound = { ...legacy, tabId: 40, timerId: expect.any(String), url: tabUrl(40) };
    expect(storage.tabTimers).toEqual({ "40": bound });
    expect(sessionTimers[40]).toEqual(bound);
    expect(storage.unmatchedTabTimers).toEqual({});
  });

  it("clears a timer", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { service } = installBrowser({}, { openTabIds: [3] });
    await service.setTabTimer(3, NOW + 60_000);

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
    const { service, storage, setLabel } = installBrowser({}, { openTabIds: [4] });
    const set = await service.setTabTimer(4, NOW + 60_000);

    await expect(service.renameTab(4, "New")).resolves.toBe(true);
    expect(setLabel).toHaveBeenCalledWith(expect.stringContaining("New"), 4, true);
    expect(storage.tabTimers).toEqual({ "4": { ...set, originalLabel: "New" } });
  });
});
