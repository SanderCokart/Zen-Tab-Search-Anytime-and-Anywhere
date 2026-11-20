import { TimerCountdown } from "@/features/timers/ui/TimerCountdown";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { StatusButton } from "@/features/status/ui/StatusButton";
import { TodoIcon } from "@/features/todos/ui/TodoIcon";
import { copyText } from "@/shared/ui/lib/copy-text";
import { miniKeyClass } from "@/features/search/ui/lib/styles";
import {
  isEssentialTab,
  tabBrowserId,
  type TabInfo,
  type TabTimer,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";
import { Led } from "@/shared/ui/primitives/Led";

/**
 * The todo, copy, timer and status buttons for a tab, shared by the result rows
 * and the issue column. They are put away until the row is selected, hovered or
 * holds focus (see `.zs-acts`). On a result row they float over the right edge so
 * the list does not relayout as the pointer moves. A todo shows a checked
 * checkbox, anything else an empty one.
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
  always = false,
  actions = {},
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
  /** Keep the keys showing, as on the current-tab strip, instead of only on the active row. */
  always?: boolean;
  /** Missing keys stay on, so isolated rows still show every action. */
  actions?: {
    todos?: boolean;
    copyLink?: boolean;
    timers?: boolean;
    statusColors?: boolean;
  };
}) {
  const tabId = tabBrowserId(tab);
  if (tabId === undefined) {
    return null;
  }
  const showTodos = actions.todos !== false;
  const showCopy = actions.copyLink !== false;
  const showTimers = actions.timers !== false;
  const showStatus = actions.statusColors !== false;

  const essential = isEssentialTab(tab);
  const todoLabel = isTodo ? "Mark as done" : "Mark as todo";
  const timerLabel = essential ? "Open timer popup" : "Open timer controls";

  return (
    <span
      class="zs-acts"
      data-testid="zen-tab-actions"
      // An open timer form or status menu keeps its keys up after the pointer leaves.
      data-always={always || timerOpen || statusMenuOpen || undefined}
    >
      {showTodos && !essential && (
        <TooltipButton
          label={todoLabel}
          aria-pressed={isTodo}
          data-testid="zen-todo-button"
          data-own-sound=""
          class={cn(miniKeyClass, "overflow-hidden")}
          onClick={(event) => {
            event.stopPropagation();
            onToggleTodo(tabId);
          }}
        >
          <TodoIcon checked={isTodo} class="size-[var(--zen-mini-key)]" />
          <Led on={isTodo} />
        </TooltipButton>
      )}
      {showCopy && tab.url !== "" && (
        <TooltipButton
          label="Copy link"
          data-testid="zen-copy-link-button"
          class={miniKeyClass}
          onClick={(event) => {
            event.stopPropagation();
            void copyText(tab.url);
          }}
        >
          <svg class="zen-icon size-[var(--zen-icon-sm)]" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </TooltipButton>
      )}
      {showTimers && (
        <TooltipButton
          label={timerLabel}
          data-testid="zen-timer-button"
          class={miniKeyClass}
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
            class={cn(timer && "text-zen-timer", "size-[var(--zen-icon-sm)]")}
          />
          <Led on={timer !== undefined} />
        </TooltipButton>
      )}
      {showStatus && (
        <StatusButton
          tab={tab}
          light={light}
          open={statusMenuOpen}
          onOpenMenu={onOpenStatusMenu}
          class={miniKeyClass}
          iconClass="size-[var(--zen-icon-md)]"
        />
      )}
    </span>
  );
}
