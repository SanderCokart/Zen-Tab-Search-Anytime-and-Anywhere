import type { TabTimer } from "@/shared/types";

/** The dock shows this many timers in all: the soonest as the LCD, the rest as rows. */
export const TIMERS_DOCK_LIMIT = 3;

export interface DockTimers {
  /** The soonest-ending timer, shown as the large readout. */
  soonest: TabTimer | undefined;
  /** The next timers in end order, listed beneath the readout. */
  upcoming: TabTimer[];
}

/**
 * Picks what the timers dock shows: the soonest-ending timers, at most `limit` of
 * them. Timers past the limit are left out; the "Active timers" drawer lists them all.
 */
export function selectDockTimers(
  timers: Iterable<TabTimer>,
  limit: number = TIMERS_DOCK_LIMIT,
): DockTimers {
  const sorted = [...timers].sort((a, b) => a.endAt - b.endAt).slice(0, limit);
  const [soonest, ...upcoming] = sorted;
  return { soonest, upcoming };
}
