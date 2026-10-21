import type { ComponentChildren } from "preact";
import { pluralize, type SearchStats } from "@/features/search/model/stats";
import { cn } from "@/shared/ui/cn";

interface Stat {
  key: string;
  text: string;
  title: string;
}

/** The stats worth a slot: tabs and spaces always, the rest once there are any. */
function visibleStats(stats: SearchStats, showForge: boolean): Stat[] {
  const all: Array<Stat & { show: boolean }> = [
    {
      key: "tabs",
      text: pluralize(stats.tabs, "tab"),
      title: "Open tabs in every space",
      show: true,
    },
    {
      key: "essentials",
      text: pluralize(stats.essentials, "essential"),
      title: "Essential tabs, included in the tab count",
      show: stats.essentials > 0,
    },
    {
      key: "spaces",
      text: pluralize(stats.spaces, "space"),
      title: "Zen spaces",
      show: true,
    },
    {
      key: "github",
      text: `${stats.github} GitHub`,
      title: "GitHub issue and pull request tabs",
      show: showForge && stats.github > 0,
    },
    {
      key: "gitlab",
      text: `${stats.gitlab} GitLab`,
      title: "GitLab issue and merge request tabs",
      show: showForge && stats.gitlab > 0,
    },
    {
      key: "todos",
      text: pluralize(stats.todos, "todo"),
      title: "Tabs marked as todo",
      show: stats.todos > 0,
    },
    {
      key: "timers",
      text: pluralize(stats.timers, "timer"),
      title: "Running tab timers",
      show: stats.timers > 0,
    },
  ];
  return all.filter((stat) => stat.show);
}

export interface StatusBarProps {
  stats: SearchStats;
  /** Whether GitHub and GitLab tabs are detected at all (the display setting). */
  showForge: boolean;
  /** The right-hand end, such as the update status. */
  children?: ComponentChildren;
}

/**
 * The line along the bottom of the search, like an editor's status bar: tab,
 * space and issue counts on the left, the version and updates on the right.
 */
export function StatusBar({ stats, showForge, children }: StatusBarProps) {
  return (
    <footer
      class={cn(
        "border-zen-line text-zen-muted mt-[var(--zen-space-2)] flex min-w-0 shrink-0 items-center justify-between",
        "gap-[var(--zen-space-3)] border-t pt-[var(--zen-space-2)] text-[length:var(--zen-text-xs)]",
      )}
      data-testid="zen-status-bar"
    >
      <ul class="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-[var(--zen-space-3)] gap-y-[var(--zen-space-1)] p-0">
        {visibleStats(stats, showForge).map((stat) => (
          <li key={stat.key} title={stat.title} data-stat={stat.key}>
            {stat.text}
          </li>
        ))}
      </ul>
      {children}
    </footer>
  );
}
