import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";
import { isEssentialTab, type SpaceInfo, type TabInfo } from "@/shared/types";

/** The counts the status bar shows under the search. */
export interface SearchStats {
  tabs: number;
  essentials: number;
  spaces: number;
  github: number;
  gitlab: number;
  todos: number;
  timers: number;
}

export function summarizeSearch({
  tabs,
  spaces,
  forgeEntries,
  todos,
  timers,
}: {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  /** Detected issue, pull request and merge request tabs; one entry per tab. */
  forgeEntries: ForgeIssueEntry[];
  todos: number;
  timers: number;
}): SearchStats {
  return {
    tabs: tabs.length,
    essentials: tabs.filter(isEssentialTab).length,
    spaces: spaces.length,
    github: forgeEntries.filter((entry) => entry.ref.platform === "github").length,
    gitlab: forgeEntries.filter((entry) => entry.ref.platform === "gitlab").length,
    todos,
    timers,
  };
}

/** "1 tab", "3 tabs". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
