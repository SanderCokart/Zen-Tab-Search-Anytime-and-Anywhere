import { debugWarn } from "../debug";
import { parseStoredTimer, parseStoredTimers } from "../messaging/protocol";
import { isUsableTabId, type TabTimer } from "../types";
import { composeTimerLabel, isAllowedTimerEnd, MAX_TIMER_MS, stripTimerPrefix } from "../timer";

export interface TimerServiceDependencies {
  setLabel(label: string, tabId: number, silent?: boolean): Promise<boolean>;
  getCustomTabLabels(tabIds: number[]): Promise<Record<number, string>>;
}

const TIMER_STORAGE_KEY = "tabTimers";
const TIMER_SESSION_KEY = "tabTimer";
const TIMER_ALARM_PREFIX = "tab-timer:";
const LOG_PREFIX = "[zen-tab-search]";

interface TabSessionStore {
  getTabValue(tabId: number, key: string): Promise<unknown>;
  setTabValue(tabId: number, key: string, value: unknown): Promise<void>;
  removeTabValue(tabId: number, key: string): Promise<void>;
}

function timerAlarmName(tabId: number): string {
  return `${TIMER_ALARM_PREFIX}${tabId}`;
}

function timerNotificationId(tabId: number): string {
  return `tab-timer-${tabId}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }

  return String(error);
}

function isSameTimer(left: TabTimer, right: TabTimer): boolean {
  return (
    left.endAt === right.endAt &&
    left.title === right.title &&
    stripTimerPrefix(left.originalLabel) === stripTimerPrefix(right.originalLabel)
  );
}

function getTabSessionStore(): TabSessionStore | undefined {
  const sessions = (browser as typeof browser & { sessions?: Partial<TabSessionStore> }).sessions;
  if (!sessions?.getTabValue || !sessions.setTabValue || !sessions.removeTabValue) {
    return undefined;
  }
  return sessions as TabSessionStore;
}

export function createTimerService({ setLabel, getCustomTabLabels }: TimerServiceDependencies) {
  const lastTimerIndicators = new Map<number, string>();
  const updatingTimerTabs = new Set<number>();
  const finishingTimerTabs = new Set<number>();
  let tickingTimers = false;
  let restoringTimers = false;
  let restoreAgain = false;

  async function readTimers(): Promise<Record<string, TabTimer>> {
    const stored = await browser.storage.local.get(TIMER_STORAGE_KEY);
    return parseStoredTimers(stored[TIMER_STORAGE_KEY]);
  }

  async function writeTimers(timers: Record<string, TabTimer>): Promise<void> {
    await browser.storage.local.set({ [TIMER_STORAGE_KEY]: timers });
  }

  async function readSessionTimer(tabId: number): Promise<TabTimer | undefined> {
    try {
      const value = await getTabSessionStore()?.getTabValue(tabId, TIMER_SESSION_KEY);
      return parseStoredTimer(value);
    } catch {
      return undefined;
    }
  }

  async function writeSessionTimer(timer: TabTimer): Promise<void> {
    try {
      await getTabSessionStore()?.setTabValue(timer.tabId, TIMER_SESSION_KEY, timer);
    } catch (error) {
      debugWarn(
        `${LOG_PREFIX} Could not persist timer to the restored tab session:`,
        formatError(error),
      );
    }
  }

  async function clearSessionTimer(tabId: number): Promise<void> {
    try {
      await getTabSessionStore()?.removeTabValue(tabId, TIMER_SESSION_KEY);
    } catch {
      // The tab may already be gone.
    }
  }

  async function listOpenTabIds(): Promise<number[]> {
    try {
      const tabs = await browser.tabs.query({});
      return tabs.map((tab) => tab.id).filter((tabId): tabId is number => isUsableTabId(tabId));
    } catch {
      return [];
    }
  }

  async function clearTimerAlarms(): Promise<void> {
    try {
      const alarms = await browser.alarms.getAll();
      await Promise.all(
        alarms
          .filter((alarm) => alarm.name.startsWith(TIMER_ALARM_PREFIX))
          .map((alarm) => browser.alarms.clear(alarm.name)),
      );
    } catch {
      // Tests and some browsers may not expose getAll.
    }
  }

  async function setTabLabelSilent(label: string, tabId: number): Promise<boolean> {
    try {
      return await setLabel(label, tabId, true);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not update timer tab label:`, formatError(error));
      return false;
    }
  }

  async function updateTimerIndicator(timer: TabTimer): Promise<void> {
    const remaining = Math.max(0, timer.endAt - Date.now());
    const label = composeTimerLabel(remaining, timer.originalLabel, timer.title);
    if (lastTimerIndicators.get(timer.tabId) === label || updatingTimerTabs.has(timer.tabId)) {
      return;
    }

    updatingTimerTabs.add(timer.tabId);

    try {
      const updated = await setTabLabelSilent(label, timer.tabId);
      if (updated) {
        lastTimerIndicators.set(timer.tabId, label);
      } else {
        lastTimerIndicators.delete(timer.tabId);
      }
    } finally {
      updatingTimerTabs.delete(timer.tabId);
    }
  }

  async function armTimer(timer: TabTimer): Promise<void> {
    await browser.alarms.clear(timerAlarmName(timer.tabId));
    await browser.alarms.create(timerAlarmName(timer.tabId), { when: timer.endAt });
    lastTimerIndicators.delete(timer.tabId);
    await updateTimerIndicator(timer);
  }

  async function clearTimerIndicators(timer: TabTimer): Promise<void> {
    lastTimerIndicators.delete(timer.tabId);
    await setTabLabelSilent(timer.originalLabel, timer.tabId);
  }

  async function finishTimer(tabId: number, notify: boolean): Promise<void> {
    if (finishingTimerTabs.has(tabId)) {
      return;
    }
    finishingTimerTabs.add(tabId);

    try {
      const timers = await readTimers();
      const timer = timers[String(tabId)];
      if (!timer) {
        return;
      }

      delete timers[String(tabId)];
      await writeTimers(timers);
      await Promise.all([
        browser.alarms.clear(timerAlarmName(tabId)),
        clearSessionTimer(tabId),
        clearTimerIndicators(timer),
      ]);

      if (!notify) {
        return;
      }

      const tabName = timer.originalLabel || timer.title || "Untitled tab";
      try {
        await browser.notifications.create(timerNotificationId(tabId), {
          type: "basic",
          iconUrl: browser.runtime.getURL("/icon/48.png"),
          title: "Tab timer finished",
          message: tabName,
        });
      } catch (error) {
        debugWarn(`${LOG_PREFIX} Could not send timer notification:`, formatError(error));
      }
    } finally {
      finishingTimerTabs.delete(tabId);
    }
  }

  async function clearTabTimer(tabId: number): Promise<boolean> {
    const timers = await readTimers();
    const timer = timers[String(tabId)];
    if (!timer) {
      return false;
    }

    delete timers[String(tabId)];
    await writeTimers(timers);
    await Promise.all([
      browser.alarms.clear(timerAlarmName(tabId)),
      clearSessionTimer(tabId),
      clearTimerIndicators(timer),
    ]);
    return true;
  }

  async function clearAllTimers(): Promise<number> {
    const timers = await readTimers();
    const list = Object.values(timers);
    await writeTimers({});
    await Promise.all(
      list.flatMap((timer) => [
        browser.alarms.clear(timerAlarmName(timer.tabId)),
        clearSessionTimer(timer.tabId),
        clearTimerIndicators(timer),
      ]),
    );
    return list.length;
  }

  async function setTabTimer(tabId: number, endAt: number): Promise<TabTimer> {
    if (!isAllowedTimerEnd(endAt)) {
      throw new Error("Timer duration must be between 1 minute and 31 days.");
    }

    const existingTimers = await readTimers();
    const existing = existingTimers[String(tabId)];
    if (existing) {
      await clearTimerIndicators(existing);
    }

    const labels = await getCustomTabLabels([tabId]);
    let title = existing?.title || "";
    try {
      const tab = await browser.tabs.get(tabId);
      title = stripTimerPrefix(tab.title || "") || tab.url || title || "Untitled tab";
    } catch {
      title = title || "Untitled tab";
    }

    const timer: TabTimer = {
      tabId,
      endAt,
      originalLabel: stripTimerPrefix(existing?.originalLabel ?? labels[tabId] ?? ""),
      title,
    };
    existingTimers[String(tabId)] = timer;
    await writeTimers(existingTimers);
    await writeSessionTimer(timer);
    await armTimer(timer);
    return timer;
  }

  async function tickActiveTimers(): Promise<void> {
    if (tickingTimers) {
      return;
    }
    tickingTimers = true;

    try {
      const timers = await readTimers();
      const openTabIds = new Set(await listOpenTabIds());
      for (const timer of Object.values(timers)) {
        if (openTabIds.size > 0 && !openTabIds.has(timer.tabId)) {
          continue;
        }
        if (timer.endAt <= Date.now()) {
          await finishTimer(timer.tabId, true);
        } else {
          void updateTimerIndicator(timer);
        }
      }
    } finally {
      tickingTimers = false;
    }
  }

  async function restorePersistedTimers(): Promise<void> {
    if (restoringTimers) {
      restoreAgain = true;
      return;
    }
    restoringTimers = true;

    try {
      try {
        await browser.browserAction.setBadgeText({ text: "" });
      } catch {
        // Badge APIs are optional; leftover text should never stay on the toolbar icon.
      }

      do {
        restoreAgain = false;

        const stored = await readTimers();
        const openTabIds = await listOpenTabIds();
        const next: Record<string, TabTimer> = {};

        for (const tabId of openTabIds) {
          const sessionTimer = await readSessionTimer(tabId);
          const localTimer = stored[String(tabId)];
          const source = sessionTimer ?? localTimer;
          if (!source) {
            continue;
          }

          next[String(tabId)] = {
            ...source,
            tabId,
            originalLabel: stripTimerPrefix(source.originalLabel || ""),
          };
        }

        if (openTabIds.length === 0) {
          // Session restore may not have created tabs yet. Keep storage intact.
          continue;
        }

        for (const timer of Object.values(stored)) {
          if (next[String(timer.tabId)]) {
            continue;
          }
          const remapped = Object.values(next).some((restored) => isSameTimer(restored, timer));
          if (!remapped) {
            next[String(timer.tabId)] = {
              ...timer,
              originalLabel: stripTimerPrefix(timer.originalLabel || ""),
            };
          }
        }

        await writeTimers(next);
        await clearTimerAlarms();

        const liveTabIds = new Set(openTabIds);
        for (const timer of Object.values(next)) {
          if (!liveTabIds.has(timer.tabId)) {
            continue;
          }

          const now = Date.now();
          if (timer.endAt <= now || timer.endAt - now > MAX_TIMER_MS) {
            await finishTimer(timer.tabId, timer.endAt <= now);
            continue;
          }

          await writeSessionTimer(timer);
          await armTimer(timer);
        }
      } while (restoreAgain);
    } finally {
      restoringTimers = false;
    }
  }

  async function adoptRestoredTab(tabId: number): Promise<void> {
    if (!isUsableTabId(tabId)) {
      return;
    }

    while (restoringTimers) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const sessionTimer = await readSessionTimer(tabId);
    if (!sessionTimer) {
      return;
    }

    const timer: TabTimer = {
      ...sessionTimer,
      tabId,
      originalLabel: stripTimerPrefix(sessionTimer.originalLabel || ""),
    };
    const timers = await readTimers();
    for (const [key, existing] of Object.entries(timers)) {
      if (existing.tabId !== tabId && isSameTimer(existing, timer)) {
        delete timers[key];
        lastTimerIndicators.delete(existing.tabId);
        await browser.alarms.clear(timerAlarmName(existing.tabId));
      }
    }

    timers[String(tabId)] = timer;
    await writeTimers(timers);

    if (timer.endAt <= Date.now() || timer.endAt - Date.now() > MAX_TIMER_MS) {
      await finishTimer(tabId, timer.endAt <= Date.now());
      return;
    }

    await writeSessionTimer(timer);
    await armTimer(timer);
  }

  async function handleTabRemoved(tabId: number, isWindowClosing: boolean): Promise<void> {
    if (isWindowClosing) {
      lastTimerIndicators.delete(tabId);
      await browser.alarms.clear(timerAlarmName(tabId));
      return;
    }

    await removeTabTimer(tabId);
  }

  async function getActiveTimers(): Promise<TabTimer[]> {
    const timers = await readTimers();
    const openTabIds = new Set(await listOpenTabIds());
    const active: TabTimer[] = [];
    for (const timer of Object.values(timers)) {
      if (openTabIds.size > 0 && !openTabIds.has(timer.tabId)) {
        continue;
      }
      if (timer.endAt <= Date.now()) {
        await finishTimer(timer.tabId, true);
      } else {
        active.push(timer);
      }
    }
    return active;
  }

  async function removeTabTimer(tabId: number): Promise<void> {
    const timers = await readTimers();
    const timer = timers[String(tabId)];
    if (!timer) {
      return;
    }

    delete timers[String(tabId)];
    lastTimerIndicators.delete(tabId);
    await writeTimers(timers);
    await Promise.all([browser.alarms.clear(timerAlarmName(tabId)), clearSessionTimer(tabId)]);
  }

  return {
    adoptRestoredTab,
    clearAllTimers,
    clearTabTimer,
    finishTimer,
    getActiveTimers,
    handleTabRemoved,
    removeTabTimer,
    restorePersistedTimers,
    setTabTimer,
    tickActiveTimers,
  };
}
