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
import { Led } from "@/shared/ui/primitives/Led";

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
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex min-h-[var(--zen-row-height)] min-w-0 items-center gap-[var(--zen-space-3)]">
        {tab.favIconUrl && (
          <img src={tab.favIconUrl} alt="" class="size-[var(--zen-icon-lg)] shrink-0 rounded-md" />
        )}
        <span class={cn("zs-row-title", entryTextClass(truncate))}>
          {displayTitle ??
            formatTabDisplayTitle({
              ...tab,
              customLabel: stripTimerPrefix(tab.customLabel || ""),
            })}
        </span>
        {isTodo && <Led on class="zs-todo-dot" />}
        <span class="zs-meta">
          {timer && !isEssentialTab(tab) && (
            <span class="zs-meta-timer zs-digits">
              <TimerCountdown endAt={timer.endAt} format="short" />
            </span>
          )}
          <span class="max-w-[calc(var(--zen-font-size)*9)] truncate">
            {tab.workspaceName || hostname(tab.url)}
          </span>
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
      {timerOpen && tabId !== undefined && (
        <div class="pb-[var(--zen-space-2)]">
          <TimerForm
            timer={timer}
            onSet={(endAt) => onSetTimer(tabId, endAt)}
            onClear={() => onClearTimer(tabId)}
          />
        </div>
      )}
    </div>
  );
});
