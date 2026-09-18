import { stripTimerPrefix } from "@/features/timers/model/timer";
import type { ForgeIssueEntry, TabInfo } from "@/shared/types";

/** Host portion of a tab URL, or a readable placeholder when it has none. */
export function hostname(url: string): string {
  try {
    return url ? new URL(url).hostname : "No URL";
  } catch {
    return "No URL";
  }
}

export interface ForgeEntryDate {
  label: string;
  relative: string;
  absolute: string;
}

const RELATIVE_UNITS = [
  { seconds: 31_536_000, unit: "year" },
  { seconds: 2_592_000, unit: "month" },
  { seconds: 604_800, unit: "week" },
  { seconds: 86_400, unit: "day" },
  { seconds: 3_600, unit: "hour" },
  { seconds: 60, unit: "minute" },
] as const satisfies readonly { seconds: number; unit: Intl.RelativeTimeFormatUnit }[];

const MINUTES = { seconds: 60, unit: "minute" } as const;

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });
const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** "Last opened" label for a forge entry, or undefined when the tab has no timestamp. */
export function formatForgeEntryDate(entry: ForgeIssueEntry): ForgeEntryDate | undefined {
  const timestamp = entry.tab.lastOpenedAt;
  if (timestamp === undefined) {
    return undefined;
  }
  const differenceSeconds = (timestamp - Date.now()) / 1000;
  const magnitude = Math.abs(differenceSeconds);
  // The minute entry is last and always matches as the fallback.
  const { seconds, unit } =
    RELATIVE_UNITS.find((candidate) => magnitude >= candidate.seconds) ?? MINUTES;
  return {
    label: "Last opened",
    relative: relativeFormatter.format(Math.round(differenceSeconds / seconds), unit),
    absolute: absoluteFormatter.format(timestamp),
  };
}

/** A tab's custom label with any timer countdown prefix removed. */
export function stripTimerPrefixFromTab(tab: TabInfo): string {
  return stripTimerPrefix(tab.customLabel || "");
}
