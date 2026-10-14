import { memo } from "preact/compat";
import { stripTimerPrefix } from "@/features/timers/model/timer";
import { TimerCountdown } from "@/features/timers/ui/TimerCountdown";
import { TimerForm } from "@/features/timers/ui/TimerForm";
import { hostname } from "@/features/search/ui/lib/format";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { TabActions } from "@/features/search/ui/components/TabActions";
import type { TabInfo, TabTimer, TrafficLight } from "@/shared/types";
import { formatTabDisplayTitle, isEssentialTab, tabBrowserId } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export const TabSearchRow = memo(function TabSearchRow({
  tab,
  timer,
  timerOpen,
  isTodo,
  light,
  statusMenuOpen,
  truncate,
  displayTitle,
  onToggleTimer,
  onOpenTimerPopup,
  onSetTimer,
  onClearTimer,
  onToggleTodo,
  onOpenStatusMenu,
}: {
  tab: TabInfo;
  timer?: TabTimer;
  timerOpen: boolean;
  isTodo: boolean;
  light?: TrafficLight;
  statusMenuOpen: boolean;
  truncate: boolean;
  displayTitle?: string;
  onToggleTimer: (tabId: number) => void;
  onOpenTimerPopup: (tabId: number) => void;
  onSetTimer: (tabId: number, endAt: number) => void;
  onClearTimer: (tabId: number) => void;
  /** Marks the tab as todo, or as done (which removes the todo). */
  onToggleTodo: (tabId: number) => void;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
}) {
  const tabId = tabBrowserId(tab);

  return (
    <>
      {tab.favIconUrl && (
        <img src={tab.favIconUrl} class="mt-px size-[var(--zen-icon-lg)] shrink-0 rounded-sm" />
      )}
      <div class="flex min-w-0 flex-1 flex-col gap-px">
        <div class="flex min-w-0 flex-col gap-[var(--zen-space-1)]">
          <div class="flex min-w-0 items-center gap-[var(--zen-space-2)]">
            <span
              class={cn(
                "min-w-0 flex-1 text-[length:var(--zen-text-base)]",
                entryTextClass(truncate),
              )}
            >
              {displayTitle ??
                formatTabDisplayTitle({
                  ...tab,
                  customLabel: stripTimerPrefix(tab.customLabel || ""),
                })}
            </span>
            <span class="text-zen-lavender ml-auto flex shrink-0 items-center justify-end gap-[var(--zen-space-1)] text-[length:var(--zen-text-xs)]">
              {timer && !isEssentialTab(tab) && <TimerCountdown endAt={timer.endAt} />}
            </span>
          </div>
          {timerOpen && tabId !== undefined && (
            <TimerForm
              timer={timer}
              onSet={(endAt) => onSetTimer(tabId, endAt)}
              onClear={() => onClearTimer(tabId)}
            />
          )}
        </div>
        <div
          class={cn(
            "text-zen-subtle flex min-w-0 items-center justify-between gap-[var(--zen-space-1)]",
            "text-[length:var(--zen-text-sm)]",
            timerOpen && "pt-[var(--zen-space-4)]",
          )}
        >
          <span class={entryTextClass(truncate)}>
            {tab.active
              ? `${tab.workspaceName || hostname(tab.url)} · Current tab`
              : tab.workspaceName || hostname(tab.url)}
          </span>
          <TabActions
            tab={tab}
            timer={timer}
            timerOpen={timerOpen}
            isTodo={isTodo}
            light={light}
            statusMenuOpen={statusMenuOpen}
            onToggleTodo={onToggleTodo}
            onOpenStatusMenu={onOpenStatusMenu}
            onToggleTimer={onToggleTimer}
            onOpenTimerPopup={onOpenTimerPopup}
          />
        </div>
      </div>
    </>
  );
});
