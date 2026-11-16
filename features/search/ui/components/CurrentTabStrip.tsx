import { forgeRowParts, type ForgeIssueEntry } from "@/features/forge/model/forge-label";
import { TAG_BASE_CLASS, TAG_CLASS } from "@/features/forge/ui/ForgeIssueNavigator";
import { forgeEntryDisplayTitle } from "@/features/search/model/ranking";
import { TabActions } from "@/features/search/ui/components/TabActions";
import { hostname } from "@/features/search/ui/lib/format";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { stripTimerPrefix } from "@/features/timers/model/timer";
import { TimerCountdown } from "@/features/timers/ui/TimerCountdown";
import {
  formatTabDisplayTitle,
  isEssentialTab,
  type TabInfo,
  type TabTimer,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";

/**
 * The tab the search was opened over, in a full-width strip under the search
 * bar. It is not in the arrow-key order and not an option; its action keys are
 * plain buttons for the mouse and Tab.
 */
export function CurrentTabStrip({
  tab,
  forgeEntry,
  timer,
  isTodo,
  light,
  statusMenuOpen,
  truncate,
  compact,
  onContextMenu,
  onToggleTodo,
  onOpenTimer,
  onOpenStatusMenu,
}: {
  tab: TabInfo;
  /** The tab's issue or request, shown in place of its plain title. */
  forgeEntry?: ForgeIssueEntry;
  timer?: TabTimer;
  isTodo: boolean;
  light?: TrafficLight;
  statusMenuOpen: boolean;
  truncate: boolean;
  /** The toolbar popup: one line, without the space or host underneath. */
  compact: boolean;
  onContextMenu: (tab: TabInfo, event: MouseEvent) => void;
  onToggleTodo: (tabId: number) => void;
  /** Opens the timer for this tab, in the overlay view or the popup window. */
  onOpenTimer: (tabId: number) => void;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
}) {
  const parts = forgeEntry
    ? forgeRowParts(forgeEntry.ref, forgeEntryDisplayTitle(forgeEntry))
    : null;
  const title = formatTabDisplayTitle({
    ...tab,
    customLabel: stripTimerPrefix(tab.customLabel || ""),
  });

  return (
    <div
      class={cn(
        // Sized to its content and left-aligned, never wider than the row.
        "zs-card flex max-w-full shrink-0 items-center self-start",
        compact ? "w-full gap-[var(--zen-space-3)]" : "w-fit gap-[var(--zen-space-4)]",
        "mb-[var(--zen-space-5)] min-h-[var(--zen-row-height)] rounded-[var(--zen-radius-lg)]",
        "py-[var(--zen-space-2)] pr-[var(--zen-space-3)] pl-[var(--zen-space-4)]",
      )}
      data-testid="zen-current-tab"
      onContextMenu={(event) => onContextMenu(tab, event)}
    >
      {!compact && (
        <span class="text-zen-danger shrink-0 font-mono text-[length:var(--zen-text-xs)] font-semibold tracking-[0.16em]">
          NOW
        </span>
      )}
      {tab.favIconUrl && (
        <img src={tab.favIconUrl} class="size-[var(--zen-icon-lg)] shrink-0 rounded-md" alt="" />
      )}
      {parts ? (
        <>
          <span class={cn(TAG_BASE_CLASS, TAG_CLASS[parts.tag])}>{parts.tag}</span>
          {!compact && (
            <span class="text-zen-muted shrink-0 font-mono text-[length:var(--zen-text-sm)]">
              {parts.ref}
            </span>
          )}
        </>
      ) : null}
      <span
        class={cn("zs-row-title", compact && "flex-1", entryTextClass(truncate))}
        title={tab.url}
      >
        {parts ? parts.title : title}
      </span>
      {!compact && timer && !isEssentialTab(tab) && (
        <span class="text-zen-timer zs-digits shrink-0 font-mono text-[length:var(--zen-text-xs)]">
          <TimerCountdown endAt={timer.endAt} format="short" />
        </span>
      )}
      {!compact && (
        <span
          class={cn(
            "text-zen-muted max-w-[calc(var(--zen-font-size)*9)] shrink-0 font-mono text-[length:var(--zen-text-xs)]",
            "truncate",
          )}
        >
          {tab.workspaceName || hostname(tab.url)}
        </span>
      )}
      <TabActions
        always
        tab={tab}
        timer={timer}
        timerOpen={false}
        isTodo={isTodo}
        light={light}
        statusMenuOpen={statusMenuOpen}
        onToggleTodo={onToggleTodo}
        onOpenStatusMenu={onOpenStatusMenu}
        onToggleTimer={onOpenTimer}
        onOpenTimerPopup={onOpenTimer}
      />
    </div>
  );
}
