import * as v from "valibot";
import { debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { tabTimerSchema } from "@/shared/messaging/protocol";
import type { TabTimer } from "@/shared/types";
import { stripTimerPrefix, TIMER_PREFIX_RE } from "@/features/timers/model/timer";
import { CLUES_NEEDED, countTimerClues, type TabClues } from "@/features/timers/model/timer-match";
import {
  readTabValue,
  removeTabValue,
  writeTabValue,
} from "@/features/timers/background/tab-session";

/** Where a click on a timer notification should take the user. */
export type TimerNotificationTarget =
  | { kind: "tab"; tabId: number }
  | { kind: "search"; query: string };

export interface TimerNotificationDependencies {
  /** Every open tab, those in spaces Zen has not opened included. */
  readAllTabClues(): Promise<TabClues[]>;
  setTabLabelSilent(label: string, tabId: number): Promise<boolean>;
  /** Drops the running-timer value a tab may still carry. */
  clearSessionTimer(tabId: number): Promise<void>;
}

/** Finished timers whose notification may still be clicked, keyed by timer ID. */
const FIRED_TIMER_STORAGE_KEY = "firedTabTimers";
/** The mark a finished timer leaves on its tab, so a click can find it again. */
const TIMER_FIRED_SESSION_KEY = "tabTimerFired";
const TIMER_NOTIFICATION_PREFIX = "tab-timer-";
const MISSING_TIMER_NOTIFICATION_PREFIX = "tab-timer-missing-";
const FIRED_TIMER_TTL_MS = 7 * 24 * 60 * 60_000;

const firedTimerSchema = v.object({
  ...tabTimerSchema.entries,
  firedAt: v.number(),
  /** Reported as "original tab not found" instead of finishing on its tab. */
  missing: v.optional(v.boolean()),
});
type FiredTimer = v.InferOutput<typeof firedTimerSchema>;

export function timerName(timer: TabTimer): string {
  return timer.originalLabel || timer.title || "Untitled tab";
}

/**
 * The notifications a timer sends when it finishes, and what clicking them
 * does. A record of each finished timer is kept so a click can find its tab
 * again, even after a restart has given the tab a new ID.
 */
export function createTimerNotifications({
  readAllTabClues,
  setTabLabelSilent,
  clearSessionTimer,
}: TimerNotificationDependencies) {
  /** Tab IDs recorded since this time still name the same tabs. */
  const startedAt = Date.now();

  async function readFiredTimers(): Promise<Record<string, FiredTimer>> {
    const stored = await browser.storage.local.get(FIRED_TIMER_STORAGE_KEY);
    const value = stored[FIRED_TIMER_STORAGE_KEY];
    const fired: Record<string, FiredTimer> = {};
    if (value && typeof value === "object") {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        const parsed = v.safeParse(firedTimerSchema, entry);
        if (parsed.success) {
          fired[parsed.output.timerId] = parsed.output;
        }
      }
    }
    return fired;
  }

  async function writeFiredTimers(fired: Record<string, FiredTimer>): Promise<void> {
    await browser.storage.local.set({ [FIRED_TIMER_STORAGE_KEY]: fired });
  }

  /** Forgets finished timers whose notification is too old to still be clicked. */
  async function pruneFiredTimers(): Promise<void> {
    const fired = await readFiredTimers();
    const cutoff = Date.now() - FIRED_TIMER_TTL_MS;
    for (const [timerId, record] of Object.entries(fired)) {
      if (record.firedAt < cutoff) {
        delete fired[timerId];
      }
    }
    await writeFiredTimers(fired);
  }

  async function showNotification(notificationId: string, title: string, message: string) {
    try {
      await browser.notifications.create(notificationId, {
        type: "basic",
        iconUrl: browser.runtime.getURL("/icon/48.png"),
        title,
        message,
      });
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not send timer notification:`, formatError(error));
    }
  }

  async function recordFiredTimer(timer: TabTimer, missing: boolean): Promise<void> {
    const fired = await readFiredTimers();
    fired[timer.timerId] = { ...timer, firedAt: Date.now(), ...(missing ? { missing } : {}) };
    await writeFiredTimers(fired);
  }

  async function stripTimerLabel(tab: TabClues): Promise<void> {
    if (TIMER_PREFIX_RE.test(tab.label)) {
      await setTabLabelSilent(stripTimerPrefix(tab.label), tab.tabId);
    }
  }

  /** Announces a timer that finished on its tab. */
  async function notifyFinished(timer: TabTimer): Promise<void> {
    await recordFiredTimer(timer, false);
    await writeTabValue(timer.tabId, TIMER_FIRED_SESSION_KEY, timer.timerId);
    await showNotification(
      `${TIMER_NOTIFICATION_PREFIX}${timer.timerId}`,
      "Tab timer finished",
      timerName(timer),
    );
  }

  /** Announces a timer that finished while no open tab matched it. */
  async function notifyMissing(timer: TabTimer): Promise<void> {
    await recordFiredTimer(timer, true);
    await showNotification(
      `${MISSING_TIMER_NOTIFICATION_PREFIX}${timer.timerId}`,
      "Tab timer finished, original tab not found",
      timerName(timer),
    );
  }

  /**
   * Finds the tab a finished timer belonged to: by the mark left on it, by two
   * agreeing clues, or by its URL when only one tab has it.
   */
  async function findFiredTab(record: FiredTimer): Promise<TabClues | undefined> {
    const tabs = await readAllTabClues();
    for (const tab of tabs) {
      if ((await readTabValue(tab.tabId, TIMER_FIRED_SESSION_KEY)) === record.timerId) {
        return tab;
      }
    }

    const matching = tabs.filter((tab) => countTimerClues(record, tab) >= CLUES_NEEDED);
    if (matching.length === 1) {
      return matching[0];
    }

    const sameUrl = record.url ? tabs.filter((tab) => tab.url === record.url) : [];
    // Within this browser session the recorded tab ID still names the same tab.
    const recorded =
      record.firedAt >= startedAt && sameUrl.find((tab) => tab.tabId === record.tabId);
    if (recorded) {
      return recorded;
    }
    const named = record.originalLabel
      ? sameUrl.filter((tab) => tab.label === record.originalLabel)
      : [];
    if (named.length === 1) {
      return named[0];
    }
    return sameUrl.length === 1 ? sameUrl[0] : undefined;
  }

  /**
   * Resolves a clicked timer notification to the tab whose timer finished. When
   * that tab cannot be found it shows a notice instead, and clicking the notice
   * looks again before searching for the tab by name.
   */
  async function resolveNotificationClick(
    notificationId: string,
  ): Promise<TimerNotificationTarget | undefined> {
    const missing = notificationId.startsWith(MISSING_TIMER_NOTIFICATION_PREFIX);
    if (!missing && !notificationId.startsWith(TIMER_NOTIFICATION_PREFIX)) {
      return undefined;
    }

    const timerId = notificationId.slice(
      (missing ? MISSING_TIMER_NOTIFICATION_PREFIX : TIMER_NOTIFICATION_PREFIX).length,
    );
    const fired = await readFiredTimers();
    const record = fired[timerId];
    if (!record) {
      return undefined;
    }

    const tab = await findFiredTab(record);
    if (!tab && !missing) {
      await showNotification(
        `${MISSING_TIMER_NOTIFICATION_PREFIX}${timerId}`,
        "Couldn't find the original tab",
        timerName(record),
      );
      return undefined;
    }

    delete fired[timerId];
    await writeFiredTimers(fired);
    if (!tab) {
      return { kind: "search", query: timerName(record) };
    }
    await removeTabValue(tab.tabId, TIMER_FIRED_SESSION_KEY);
    await clearSessionTimer(tab.tabId);
    await stripTimerLabel(tab);
    return { kind: "tab", tabId: tab.tabId };
  }

  /** Points a timer already reported as missing at its tab, so its notice opens it. */
  async function linkLateTab(tab: TabClues): Promise<boolean> {
    const fired = await readFiredTimers();
    const record = Object.values(fired).find(
      (entry) => entry.missing && countTimerClues(entry, tab) >= CLUES_NEEDED,
    );
    if (!record) {
      return false;
    }

    fired[record.timerId] = { ...record, tabId: tab.tabId, url: tab.url || record.url };
    await writeFiredTimers(fired);
    await clearSessionTimer(tab.tabId);
    await writeTabValue(tab.tabId, TIMER_FIRED_SESSION_KEY, record.timerId);
    await stripTimerLabel(tab);
    return true;
  }

  return {
    linkLateTab,
    notifyFinished,
    notifyMissing,
    pruneFiredTimers,
    resolveNotificationClick,
  };
}
