import type { TabInfo } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

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
  /** Drop the inset well when the summary sits on a card that is already a surface. */
  plain?: boolean;
}

/**
 * Names the tab a timer or host override form acts on, with its icon, space
 * and hostname, so the user can tell which tab they are editing.
 */
export function TabSummary({ label, tab, title, plain = false }: TabSummaryProps) {
  const host = tab ? hostname(tab.url) : "";
  const details = tab ? [tab.workspaceName, host || tab.url || "No URL"].filter(Boolean) : [];

  return (
    <section
      class={cn(
        "flex min-w-0 flex-1 flex-col gap-[var(--zen-space-1)]",
        !plain && "zs-well rounded-[var(--zs-r-lcd)] p-[var(--zen-space-2)]",
      )}
      data-testid="zen-tab-summary"
      aria-label={`${label} ${title}`}
    >
      <span class="zs-label">{label}</span>
      <div class="flex min-w-0 items-center gap-[var(--zen-space-2)]">
        {tab?.favIconUrl && (
          <img src={tab.favIconUrl} alt="" class="size-[var(--zen-icon-lg)] shrink-0 rounded-sm" />
        )}
        <div class="flex min-w-0 flex-1 flex-col">
          <strong
            class={cn(
              "truncate font-semibold",
              plain ? "text-[length:var(--zen-text-lg)]" : "text-[length:var(--zen-text-md)]",
            )}
          >
            {title}
          </strong>
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
