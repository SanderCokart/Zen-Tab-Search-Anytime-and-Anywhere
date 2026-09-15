import { debugWarn } from "../debug";
import type { TabTimer } from "../types";
import { composeTimerLabel, isAllowedTimerEnd, MAX_TIMER_MS, stripTimerPrefix } from "../timer";

export interface TimerServiceDependencies {
  setLabel(label: string, tabId: number, silent?: boolean): Promise<boolean>;
  getCustomTabLabels(tabIds: number[]): Promise<Record<number, string>>;
}

const TIMER_STORAGE_KEY = "tabTimers";
const TIMER_ALARM_PREFIX = "tab-timer:";
const LOG_PREFIX = "[zen-tab-search]";

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

export function createTimerService({ setLabel, getCustomTabLabels }: TimerServiceDependencies) {
  const lastTimerIndicators = new Map<number, string>();
  const updatingTimerTabs = new Set<number>();
  const finishingTimerTabs = new Set<number>();
  let tickingTimers = false;

  async function readTimers(): Promise<Record<string, TabTimer>> {
    const stored = await browser.storage.local.get(TIMER_STORAGE_KEY);
    const timers = stored[TIMER_STORAGE_KEY];
    return timers && typeof timers === "object" ? (timers as Record<string, TabTimer>) : {};
  }

  async function writeTimers(timers: Record<string, TabTimer>): Promise<void> {
    await browser.storage.local.set({ [TIMER_STORAGE_KEY]: timers });
  }

  async function setTabLabelSilent(label: string, tabId: number): Promise<void> {
    try {
      await setLabel(label, tabId, true);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not update timer tab label:`, formatError(error));
    }
  }

  async function updateTimerIndicator(timer: TabTimer): Promise<void> {
    const remaining = Math.max(0, timer.endAt - Date.now());
    const label = composeTimerLabel(remaining, timer.originalLabel, timer.title);
    if (lastTimerIndicators.get(timer.tabId) === label || updatingTimerTabs.has(timer.tabId)) {
      return;
    }

    lastTimerIndicators.set(timer.tabId, label);
    updatingTimerTabs.add(timer.tabId);

    try {
      await setTabLabelSilent(label, timer.tabId);
    } finally {
      updatingTimerTabs.delete(timer.tabId);
    }
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
      await Promise.all([browser.alarms.clear(timerAlarmName(tabId)), clearTimerIndicators(timer)]);

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
    await browser.alarms.clear(timerAlarmName(tabId));
    await clearTimerIndicators(timer);
    return true;
  }

  async function clearAllTimers(): Promise<number> {
    const timers = await readTimers();
    const list = Object.values(timers);
    await writeTimers({});
    await Promise.all(
      list.flatMap((timer) => [
        browser.alarms.clear(timerAlarmName(timer.tabId)),
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
    lastTimerIndicators.delete(tabId);
    await browser.alarms.clear(timerAlarmName(tabId));
    await browser.alarms.create(timerAlarmName(tabId), { when: endAt });
    await updateTimerIndicator(timer);
    return timer;
  }

  async function tickActiveTimers(): Promise<void> {
    if (tickingTimers) {
      return;
    }
    tickingTimers = true;

    try {
      const timers = await readTimers();
      for (const timer of Object.values(timers)) {
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
    try {
      await browser.browserAction.setBadgeText({ text: "" });
    } catch {
      // Badge APIs are optional; leftover text should never stay on the toolbar icon.
    }

    const timers = await readTimers();
    let changed = false;
    for (const timer of Object.values(timers)) {
      const originalLabel = stripTimerPrefix(timer.originalLabel || "");
      if (originalLabel !== timer.originalLabel) {
        timer.originalLabel = originalLabel;
        changed = true;
      }
    }
    if (changed) {
      await writeTimers(timers);
    }

    for (const timer of Object.values(timers)) {
      const now = Date.now();
      if (timer.endAt <= now || timer.endAt - now > MAX_TIMER_MS) {
        await finishTimer(timer.tabId, timer.endAt <= now);
        continue;
      }

      await browser.alarms.create(timerAlarmName(timer.tabId), { when: timer.endAt });
      lastTimerIndicators.delete(timer.tabId);
      await updateTimerIndicator(timer);
    }
  }

  async function getActiveTimers(): Promise<TabTimer[]> {
    const timers = await readTimers();
    const active: TabTimer[] = [];
    for (const timer of Object.values(timers)) {
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
    await browser.alarms.clear(timerAlarmName(tabId));
  }

  return {
    clearAllTimers,
    clearTabTimer,
    finishTimer,
    getActiveTimers,
    removeTabTimer,
    restorePersistedTimers,
    setTabTimer,
    tickActiveTimers,
  };
}
