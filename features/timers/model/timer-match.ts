import type { StoredTabTimer } from "@/shared/messaging/protocol";
import type { TabTimer } from "@/shared/types";
import { stripTimerPrefix, TIMER_PREFIX_RE } from "@/features/timers/model/timer";

/** What a tab offers for finding its timer after a restart. */
export interface TabClues {
  tabId: number;
  url: string;
  /** Zen's own label, which survives a restart even on unloaded tabs. */
  label: string;
  /** The timer saved on the tab itself, which Zen drops for unloaded tabs. */
  session?: StoredTabTimer;
}

type TimerFields = Pick<TabTimer, "timerId" | "endAt" | "originalLabel" | "title" | "url">;

/** How many clues have to agree before a tab gets a timer. */
export const CLUES_NEEDED = 2;

/** Session values written before timer IDs existed can only be matched by their contents. */
export function isSameTimer(timer: TimerFields, session: StoredTabTimer): boolean {
  if (session.timerId) {
    return timer.timerId === session.timerId;
  }
  return (
    timer.endAt === session.endAt &&
    timer.title === session.title &&
    stripTimerPrefix(timer.originalLabel) === stripTimerPrefix(session.originalLabel)
  );
}

/** The ⏱ countdown only this extension writes, naming this timer. */
export function hasTimerLabel(label: string, timer: TimerFields): boolean {
  return (
    TIMER_PREFIX_RE.test(label) &&
    stripTimerPrefix(label) === stripTimerPrefix(timer.originalLabel || timer.title)
  );
}

/** Counts the clues that tie a tab to a timer: its saved timer, its URL and its ⏱ label. */
export function countTimerClues(timer: TimerFields, tab: TabClues): number {
  let clues = 0;
  if (tab.session && isSameTimer(timer, tab.session)) clues += 1;
  if (timer.url && tab.url === timer.url) clues += 1;
  if (hasTimerLabel(tab.label, timer)) clues += 1;
  return clues;
}

/**
 * Pairs timers with tabs, strongest evidence first, each tab and timer at most
 * once. A pair needs at least two agreeing clues, since any one of them can
 * mislead: tab IDs are reused, URLs repeat, and Zen loses saved values.
 */
export function matchTimersToTabs<T extends TimerFields>(
  timers: T[],
  tabs: TabClues[],
): Map<T, TabClues> {
  const pairs = timers
    .flatMap((timer) => tabs.map((tab) => ({ timer, tab, clues: countTimerClues(timer, tab) })))
    .filter((pair) => pair.clues >= CLUES_NEEDED)
    .sort((left, right) => right.clues - left.clues);

  const matches = new Map<T, TabClues>();
  const usedTabs = new Set<number>();
  for (const { timer, tab } of pairs) {
    if (matches.has(timer) || usedTabs.has(tab.tabId)) continue;
    matches.set(timer, tab);
    usedTabs.add(tab.tabId);
  }
  return matches;
}
