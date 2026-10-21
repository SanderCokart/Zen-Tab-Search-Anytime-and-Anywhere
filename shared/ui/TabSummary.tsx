import type { TabInfo } from "@/shared/types";

function hostname(url: string): string {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}

export interface TabSummaryProps {
  /** What the controls below act on, such as "Timer for" or "Overrides for". */
  label: string;
  /** Undefined while the tab is loading. */
  tab: TabInfo | undefined;
  /** The title to show, so a caller can strip its own label prefix first. */
  title: string;
}

/**
 * Names the tab a timer or host override form acts on, with its icon, space
 * and hostname, so the user can tell which tab they are editing.
 */
export function TabSummary({ label, tab, title }: TabSummaryProps) {
  const host = tab ? hostname(tab.url) : "";
  const details = tab ? [tab.workspaceName, host || tab.url || "No URL"].filter(Boolean) : [];

  return (
    <section
      class="border-zen-line bg-zen-chip flex flex-col gap-[var(--zen-space-1)] rounded-[var(--zen-radius)] border p-[var(--zen-space-2)]"
      data-testid="zen-tab-summary"
      aria-label={`${label} ${title}`}
    >
      <span class="text-zen-faint text-[length:var(--zen-text-xs)] tracking-wide uppercase">
        {label}
      </span>
      <div class="flex min-w-0 items-center gap-[var(--zen-space-2)]">
        {tab?.favIconUrl && (
          <img src={tab.favIconUrl} alt="" class="size-[var(--zen-icon-lg)] shrink-0 rounded-sm" />
        )}
        <div class="flex min-w-0 flex-1 flex-col">
          <strong class="truncate text-[length:var(--zen-text-md)] font-semibold">{title}</strong>
          {details.length > 0 && (
            <span class="text-zen-subtle truncate text-[length:var(--zen-text-sm)]">
              {details.join(" · ")}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
