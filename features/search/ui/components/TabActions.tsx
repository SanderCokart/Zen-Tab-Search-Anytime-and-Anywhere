import { TimerCountdown } from "@/features/timers/ui/TimerCountdown";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { StatusButton } from "@/features/status/ui/StatusButton";
import { TodoIcon } from "@/features/todos/ui/TodoIcon";
import {
  isEssentialTab,
  tabBrowserId,
  type TabInfo,
  type TabTimer,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";

const iconButtonClass =
  "inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-inherit hover:text-inherit";

/**
 * The todo, timer and status buttons for a tab, shared by the result rows and
 * the issue column. A todo shows a checked checkbox, anything else an empty one.
 */
export function TabActions({
  tab,
  timer,
  timerOpen,
  isTodo,
  light,
  statusMenuOpen,
  onToggleTodo,
  onToggleTimer,
  onOpenTimerPopup,
  onOpenStatusMenu,
}: {
  tab: TabInfo;
  timer?: TabTimer;
  timerOpen: boolean;
  isTodo: boolean;
  light?: TrafficLight;
  /** Whether this tab's status menu is the one open. */
  statusMenuOpen: boolean;
  /** Marks the tab as todo, or as done (which removes the todo). */
  onToggleTodo: (tabId: number) => void;
  onToggleTimer: (tabId: number) => void;
  onOpenTimerPopup: (tabId: number) => void;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
}) {
  const tabId = tabBrowserId(tab);
  if (tabId === undefined) {
    return null;
  }

  const essential = isEssentialTab(tab);
  const todoLabel = isTodo ? "Mark as done" : "Mark as todo";
  const timerLabel = essential ? "Open timer popup" : "Open timer controls";

  return (
    <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
      {!essential && (
        <TooltipButton
          label={todoLabel}
          aria-pressed={isTodo}
          data-testid="zen-todo-button"
          class={cn(iconButtonClass, isTodo && "text-zen-lavender")}
          onClick={(event) => {
            event.stopPropagation();
            onToggleTodo(tabId);
          }}
        >
          <TodoIcon checked={isTodo} class="size-[var(--zen-icon-sm)]" />
        </TooltipButton>
      )}
      <TooltipButton
        label={timerLabel}
        data-testid="zen-timer-button"
        class={iconButtonClass}
        tooltip={
          timer ? (
            <>
              Timer: <TimerCountdown endAt={timer.endAt} prefix="" />
            </>
          ) : essential ? (
            "Open timer popup"
          ) : timerOpen ? (
            "Close timer controls"
          ) : (
            "Open timer controls"
          )
        }
        onClick={(event) => {
          event.stopPropagation();
          if (essential) {
            onOpenTimerPopup(tabId);
          } else {
            onToggleTimer(tabId);
          }
        }}
      >
        <TimerIcon
          close={timerOpen}
          class={cn(timer && "text-zen-border", "size-[var(--zen-icon-sm)]")}
        />
      </TooltipButton>
      <StatusButton
        tab={tab}
        light={light}
        open={statusMenuOpen}
        onOpenMenu={onOpenStatusMenu}
        class="p-0 text-inherit"
        iconClass="size-[var(--zen-icon-md)]"
      />
    </span>
  );
}
