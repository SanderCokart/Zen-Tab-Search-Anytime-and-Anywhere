import { debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import {
  parseStoredTimer,
  parseStoredTimers,
  type StoredTabTimer,
} from "@/shared/messaging/protocol";
import { isUsableTabId, type TabTimer } from "@/shared/types";
import {
  composeTimerLabel,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  stripTimerPrefix,
  TIMER_PREFIX_RE,
} from "@/features/timers/model/timer";
import { isSameTimer, matchTimersToTabs, type TabClues } from "@/features/timers/model/timer-match";
import {
  readTabValue,
  removeTabValue,
  writeTabValue,
} from "@/features/timers/background/tab-session";
import { createTimerNotifications } from "@/features/timers/background/timer-notifications";

/** An open tab as the tab list reports it; `customLabel` is Zen's own label. */
export interface OpenTab {
  id?: number;
  title?: string;
  url?: string;
  customLabel?: string;
}

export interface TimerServiceDependencies {
  setLabel(label: string, tabId: number, silent?: boolean): Promise<boolean>;
  /**
   * Every open tab with its label. Firefox's tabs.query leaves out tabs in a Zen
   * space that has not been opened yet, so this has to come from Zen's own list.
   */
  listTabs(): Promise<OpenTab[]>;
}

const TIMER_STORAGE_KEY = "tabTimers";
/** Timers no open tab has claimed yet, keyed by timer ID because their tab IDs are stale. */
const UNMATCHED_TIMER_STORAGE_KEY = "unmatchedTabTimers";
const TIMER_SESSION_KEY = "tabTimer";
const TIMER_ALARM_PREFIX = "tab-timer:";
const EMPTY_TAB_RESTORE_DELAY_MS = 100;
const EMPTY_TAB_RESTORE_MAX_RETRIES = 50;

function timerAlarmName(tabId: number): string {
  return `${TIMER_ALARM_PREFIX}${tabId}`;
}

function newTimerId(): string {
  return crypto.randomUUID();
}

function withTimerId(timer: StoredTabTimer): TabTimer {
  return { ...timer, timerId: timer.timerId ?? newTimerId() };
}

export function createTimerService({ setLabel, listTabs }: TimerServiceDependencies) {
  const lastTimerIndicators = new Map<number, string>();
  const updatingTimerTabs = new Set<number>();
  const finishingTimerTabs = new Set<number>();
  let tickingTimers = false;
  let restoringTimers = false;
  let restoreAgain = false;
  let emptyTabRestoreRetries = 0;
  let emptyTabRestoreTimer: ReturnType<typeof setTimeout> | undefined;
  let lifetimeStart: Promise<void> | undefined;
  /** Unmatched timers are only reported once restore has seen the tabs. */
  let tabsSeen = false;

  const notifications = createTimerNotifications({
    readAllTabClues,
    setTabLabelSilent,
    clearSessionTimer,
  });

  function scheduleEmptyTabRestoreRetry() {
    if (
      emptyTabRestoreTimer !== undefined ||
      emptyTabRestoreRetries >= EMPTY_TAB_RESTORE_MAX_RETRIES
    ) {
      return;
    }

    emptyTabRestoreRetries += 1;
    emptyTabRestoreTimer = setTimeout(() => {
      emptyTabRestoreTimer = undefined;
      void restorePersistedTimers();
    }, EMPTY_TAB_RESTORE_DELAY_MS);
  }

  async function readTimers(): Promise<Record<string, TabTimer>> {
    const stored = await browser.storage.local.get(TIMER_STORAGE_KEY);
    const timers: Record<string, TabTimer> = {};
    for (const [key, timer] of Object.entries(parseStoredTimers(stored[TIMER_STORAGE_KEY]))) {
      timers[key] = withTimerId(timer);
    }
    return timers;
  }

  async function writeTimers(timers: Record<string, TabTimer>): Promise<void> {
    await browser.storage.local.set({ [TIMER_STORAGE_KEY]: timers });
  }

  async function readUnmatchedTimers(): Promise<Record<string, TabTimer>> {
    const stored = await browser.storage.local.get(UNMATCHED_TIMER_STORAGE_KEY);
    const value = stored[UNMATCHED_TIMER_STORAGE_KEY];
    const timers: Record<string, TabTimer> = {};
    if (value && typeof value === "object") {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        const parsed = parseStoredTimer(entry);
        if (parsed) {
          const timer = withTimerId(parsed);
          timers[timer.timerId] = timer;
        }
      }
    }
    return timers;
  }

  async function writeUnmatchedTimers(timers: Record<string, TabTimer>): Promise<void> {
    await browser.storage.local.set({ [UNMATCHED_TIMER_STORAGE_KEY]: timers });
  }

  async function readSessionTimer(tabId: number): Promise<StoredTabTimer | undefined> {
    return parseStoredTimer(await readTabValue(tabId, TIMER_SESSION_KEY));
  }

  async function writeSessionTimer(timer: TabTimer): Promise<void> {
    await writeTabValue(timer.tabId, TIMER_SESSION_KEY, timer);
  }

  async function clearSessionTimer(tabId: number): Promise<void> {
    await removeTabValue(tabId, TIMER_SESSION_KEY);
  }

  /**
   * Tab IDs only hold within one browser session, so timers an earlier run saved
   * by tab ID are set aside by timer ID until a tab matches them again.
   */
  function startLifetime(): Promise<void> {
    lifetimeStart ??= (async () => {
      const [stored, unmatched] = await Promise.all([readTimers(), readUnmatchedTimers()]);
      for (const timer of Object.values(stored)) {
        unmatched[timer.timerId] = timer;
      }
      await writeUnmatchedTimers(unmatched);
      await writeTimers({});
      await notifications.pruneFiredTimers();
    })().catch((error) => {
      debugWarn(`${LOG_PREFIX} Could not set aside stored timers:`, formatError(error));
    });
    return lifetimeStart;
  }

  async function readOpenTabs(): Promise<OpenTab[]> {
    try {
      return await listTabs();
    } catch {
      return [];
    }
  }

  async function toTabClues(tabs: OpenTab[]): Promise<TabClues[]> {
    const usable = tabs.filter((tab): tab is OpenTab & { id: number } => isUsableTabId(tab.id));
    return Promise.all(
      usable.map(async (tab) => ({
        tabId: tab.id,
        url: tab.url ?? "",
        label: tab.customLabel ?? "",
        session: await readSessionTimer(tab.id),
      })),
    );
  }

  /** Every open tab, those in spaces Zen has not opened included, with what identifies it. */
  async function readAllTabClues(): Promise<TabClues[]> {
    return toTabClues(await readOpenTabs());
  }

  async function readTabClues(tabId: number): Promise<TabClues | undefined> {
    const tab = (await readOpenTabs()).find((open) => open.id === tabId);
    return tab ? (await toTabClues([tab]))[0] : undefined;
  }

  async function listOpenTabIds(): Promise<number[]> {
    return (await readOpenTabs())
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => isUsableTabId(tabId));
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

  /** Removes the ⏱ countdown from tabs that no longer have a timer. */
  async function stripLeftoverPrefixes(
    tabs: TabClues[],
    timers: Record<string, TabTimer>,
  ): Promise<void> {
    for (const tab of tabs) {
      if (!timers[String(tab.tabId)] && TIMER_PREFIX_RE.test(tab.label)) {
        await setTabLabelSilent(stripTimerPrefix(tab.label), tab.tabId);
      }
    }
  }

  async function finishTimer(tabId: number, notify: boolean): Promise<void> {
    await startLifetime();
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

      if (notify) {
        await notifications.notifyFinished(timer);
      }
    } finally {
      finishingTimerTabs.delete(tabId);
    }
  }

  /** Reports unmatched timers that are due; their tab was not among the open tabs. */
  async function reportMissingTimers(): Promise<void> {
    if (!tabsSeen) {
      return;
    }

    const unmatched = await readUnmatchedTimers();
    const now = Date.now();
    const due = Object.values(unmatched).filter((timer) => timer.endAt <= now);
    if (due.length === 0) {
      return;
    }

    for (const timer of due) {
      delete unmatched[timer.timerId];
    }
    await writeUnmatchedTimers(unmatched);
    for (const timer of due) {
      await notifications.notifyMissing(timer);
    }
    await stripLeftoverPrefixes(await readAllTabClues(), await readTimers());
  }

  async function resolveNotificationClick(notificationId: string) {
    await startLifetime();
    return notifications.resolveNotificationClick(notificationId);
  }

  async function clearTabTimer(tabId: number): Promise<boolean> {
    await startLifetime();
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
    await startLifetime();
    const timers = await readTimers();
    const list = Object.values(timers);
    await writeTimers({});
    await writeUnmatchedTimers({});
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

    await startLifetime();
    const existingTimers = await readTimers();
    const existing = existingTimers[String(tabId)];
    if (existing) {
      await clearTimerIndicators(existing);
    }

    const tab = (await readOpenTabs()).find((open) => open.id === tabId);
    const timer: TabTimer = {
      timerId: existing?.timerId ?? newTimerId(),
      tabId,
      endAt,
      originalLabel: stripTimerPrefix(existing?.originalLabel ?? tab?.customLabel ?? ""),
      title: stripTimerPrefix(tab?.title || "") || tab?.url || existing?.title || "Untitled tab",
      url: tab?.url || existing?.url || "",
    };
    existingTimers[String(tabId)] = timer;
    await writeTimers(existingTimers);
    await writeSessionTimer(timer);
    await armTimer(timer);
    return timer;
  }

  /** Keeps each timer's URL current, since it helps find the tab after a restart. */
  async function trackTimerUrls(tabs: OpenTab[]): Promise<void> {
    const urls = new Map(tabs.map((tab) => [tab.id, tab.url]));
    const timers = await readTimers();
    const changed: TabTimer[] = [];
    for (const [key, timer] of Object.entries(timers)) {
      const url = urls.get(timer.tabId);
      if (url && url !== timer.url) {
        timers[key] = { ...timer, url };
        changed.push(timers[key]);
      }
    }
    if (changed.length > 0) {
      await writeTimers(timers);
      await Promise.all(changed.map(writeSessionTimer));
    }
  }

  async function tickActiveTimers(): Promise<void> {
    if (tickingTimers) {
      return;
    }
    tickingTimers = true;

    try {
      await startLifetime();
      const tabs = await readOpenTabs();
      await trackTimerUrls(tabs);
      const timers = await readTimers();
      const openTabIds = new Set(tabs.map((tab) => tab.id));
      for (const timer of Object.values(timers)) {
        if (!openTabIds.has(timer.tabId)) {
          continue;
        }
        if (timer.endAt <= Date.now()) {
          await finishTimer(timer.tabId, true);
        } else {
          void updateTimerIndicator(timer);
        }
      }
      if (!restoringTimers) {
        await reportMissingTimers();
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

      await startLifetime();

      do {
        restoreAgain = false;

        const tabs = await readAllTabClues();
        if (tabs.length === 0) {
          // Session restore may not have created tabs yet. Retry after the lock
          // is released so tab adoption is not blocked.
          scheduleEmptyTabRestoreRetry();
          continue;
        }

        tabsSeen = true;
        emptyTabRestoreRetries = 0;
        if (emptyTabRestoreTimer !== undefined) {
          clearTimeout(emptyTabRestoreTimer);
          emptyTabRestoreTimer = undefined;
        }

        const [stored, unmatched] = await Promise.all([readTimers(), readUnmatchedTimers()]);
        const candidates = [
          ...new Map(
            [...Object.values(stored), ...Object.values(unmatched)].map((timer) => [
              timer.timerId,
              timer,
            ]),
          ).values(),
        ];
        const next: Record<string, TabTimer> = {};
        const remaining: Record<string, TabTimer> = {};
        const matches = matchTimersToTabs(candidates, tabs);
        for (const timer of candidates) {
          const tab = matches.get(timer);
          const cleaned = { ...timer, originalLabel: stripTimerPrefix(timer.originalLabel || "") };
          if (tab) {
            next[String(tab.tabId)] = { ...cleaned, tabId: tab.tabId, url: tab.url || timer.url };
          } else {
            remaining[timer.timerId] = cleaned;
          }
        }

        for (const tab of tabs) {
          const session = tab.session;
          if (!session || next[String(tab.tabId)]) {
            continue;
          }
          const known = candidates.find((timer) => isSameTimer(timer, session));
          if (known) {
            // Duplicated from a tab that owns the timer; an unmatched one stays put.
            if (!remaining[known.timerId]) {
              await clearSessionTimer(tab.tabId);
            }
          } else if (session.endAt <= Date.now()) {
            await clearSessionTimer(tab.tabId);
          } else {
            // The tab kept its timer but storage lost it.
            next[String(tab.tabId)] = {
              ...withTimerId(session),
              tabId: tab.tabId,
              url: tab.url || session.url,
              originalLabel: stripTimerPrefix(session.originalLabel || ""),
            };
          }
        }

        await writeTimers(next);
        await writeUnmatchedTimers(remaining);
        await clearTimerAlarms();

        for (const timer of Object.values(next)) {
          const now = Date.now();
          if (timer.endAt <= now || timer.endAt - now > MAX_TIMER_MS) {
            await finishTimer(timer.tabId, timer.endAt <= now);
            continue;
          }

          await writeSessionTimer(timer);
          await armTimer(timer);
        }

        await stripLeftoverPrefixes(tabs, next);
        await reportMissingTimers();
      } while (restoreAgain);
    } finally {
      restoringTimers = false;
    }
  }

  async function adoptRestoredTab(tabId: number): Promise<void> {
    if (!isUsableTabId(tabId)) {
      return;
    }

    await startLifetime();
    while (restoringTimers) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const tab = await readTabClues(tabId);
    if (!tab) {
      return;
    }
    tabsSeen = true;

    const [timers, unmatched] = await Promise.all([readTimers(), readUnmatchedTimers()]);
    const openTabIds = new Set(await listOpenTabIds());
    // A timer whose tab is still open belongs to that tab, not to a duplicate of it.
    const boundElsewhere = Object.values(timers).filter(
      (timer) => timer.tabId !== tabId && openTabIds.has(timer.tabId),
    );
    const closedBound = Object.values(timers).filter((timer) => !openTabIds.has(timer.tabId));
    const candidates = [...Object.values(unmatched), ...closedBound];
    const [match] = matchTimersToTabs(candidates, [tab]).keys();

    if (!match) {
      const session = tab.session;
      if (session && boundElsewhere.some((timer) => isSameTimer(timer, session))) {
        await clearSessionTimer(tabId);
        return;
      }
      if (await notifications.linkLateTab(tab)) {
        return;
      }
      if (!session || candidates.some((timer) => isSameTimer(timer, session))) {
        return;
      }
      if (session.endAt <= Date.now()) {
        await clearSessionTimer(tabId);
        return;
      }
    }

    const source = match ?? withTimerId(tab.session!);
    delete unmatched[source.timerId];
    if (match && timers[String(match.tabId)]?.timerId === match.timerId) {
      delete timers[String(match.tabId)];
      lastTimerIndicators.delete(match.tabId);
      await browser.alarms.clear(timerAlarmName(match.tabId));
    }

    const timer: TabTimer = {
      ...source,
      tabId,
      url: tab.url || source.url,
      originalLabel: stripTimerPrefix(source.originalLabel || ""),
    };
    timers[String(tabId)] = timer;
    await writeTimers(timers);
    await writeUnmatchedTimers(unmatched);

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

  async function getActiveTimers(openTabIds?: Iterable<number>): Promise<TabTimer[]> {
    await startLifetime();
    const timers = await readTimers();
    const openIds = new Set(openTabIds ?? (await listOpenTabIds()));
    const active: TabTimer[] = [];
    for (const timer of Object.values(timers)) {
      if (!openIds.has(timer.tabId)) {
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

  async function renameTab(tabId: number, label: string): Promise<boolean> {
    await startLifetime();
    const name = label.replace(/\s+/g, " ").trim();
    const timers = await readTimers();
    const timer = timers[String(tabId)];
    if (!timer) {
      return setLabel(name, tabId, false);
    }

    const next: TabTimer = {
      ...timer,
      originalLabel: stripTimerPrefix(name),
    };
    const remaining = Math.max(0, next.endAt - Date.now());
    const indicator = composeTimerLabel(remaining, next.originalLabel, next.title);
    const updated = await setTabLabelSilent(indicator, tabId);
    if (!updated) {
      return false;
    }

    timers[String(tabId)] = next;
    lastTimerIndicators.set(tabId, indicator);
    await writeTimers(timers);
    await writeSessionTimer(next);
    return true;
  }

  async function removeTabTimer(tabId: number): Promise<void> {
    await startLifetime();
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
    resolveNotificationClick,
    restorePersistedTimers,
    renameTab,
    setTabTimer,
    tickActiveTimers,
  };
}
