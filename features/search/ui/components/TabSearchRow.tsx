import { memo } from "preact/compat";
import { useState } from "preact/hooks";
import { stripTimerPrefix } from "@/features/timers/model/timer";
import { TimerCountdown } from "@/features/timers/ui/TimerCountdown";
import { TimerForm } from "@/features/timers/ui/TimerForm";
import { TodoIcon } from "@/features/todos/ui/TodoIcon";
import { hostname } from "@/features/search/ui/lib/format";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import type { TabInfo, TabTimer } from "@/shared/types";
import { formatTabDisplayTitle, isEssentialTab, tabBrowserId } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export const TabSearchRow = memo(function TabSearchRow({
  tab,
  timer,
  timerOpen,
  isTodo,
  truncate,
  displayTitle,
  onToggleTimer,
  onOpenTimerPopup,
  onSetTimer,
  onClearTimer,
  onToggleTodo,
}: {
  tab: TabInfo;
  timer?: TabTimer;
  timerOpen: boolean;
  isTodo: boolean;
  truncate: boolean;
  displayTitle?: string;
  onToggleTimer: (tabId: number) => void;
  onOpenTimerPopup: (tabId: number) => void;
  onSetTimer: (tabId: number, endAt: number) => void;
  onClearTimer: (tabId: number) => void;
  /** Marks the tab as todo, or as done (which removes the todo). */
  onToggleTodo: (tabId: number) => void;
}) {
  const tabId = tabBrowserId(tab);
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);
  const canMarkTodo = tabId !== undefined && !isEssentialTab(tab);

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
          {tabId !== undefined && (
            <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
              {canMarkTodo && (
                <button
                  type="button"
                  aria-label={isTodo ? "Mark as done" : "Mark as todo"}
                  aria-pressed={isTodo}
                  data-testid="zen-todo-button"
                  class={cn(
                    "inline-flex cursor-pointer items-center border-0 bg-transparent p-0 hover:text-inherit",
                    isTodo ? "text-zen-lavender" : "text-inherit",
                  )}
                  title={isTodo ? "Mark as done" : "Mark as todo"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleTodo(tabId);
                  }}
                >
                  <TodoIcon class="size-[var(--zen-icon-sm)]" />
                </button>
              )}
              {tabId !== undefined && (
                <span
                  class="group relative inline-flex shrink-0"
                  onMouseEnter={() => setTooltipSuppressed(false)}
                >
                  <button
                    type="button"
                    aria-label={isEssentialTab(tab) ? "Open timer popup" : "Open timer controls"}
                    class="inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-inherit hover:text-inherit"
                    onClick={(event) => {
                      event.stopPropagation();
                      setTooltipSuppressed(true);
                      if (isEssentialTab(tab)) {
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
                  </button>
                  <span
                    class={cn(
                      "bg-zen-tooltip pointer-events-none absolute right-0 bottom-full z-10 mb-1 w-max max-w-[220px] rounded px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-xs)] opacity-0 shadow transition-opacity",
                      !tooltipSuppressed && "opacity-0 group-hover:opacity-100",
                    )}
                    role="tooltip"
                  >
                    {timer ? (
                      <>
                        Timer: <TimerCountdown endAt={timer.endAt} prefix="" />
                      </>
                    ) : isEssentialTab(tab) ? (
                      "Open timer popup"
                    ) : timerOpen ? (
                      "Close timer controls"
                    ) : (
                      "Open timer controls"
                    )}
                  </span>
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </>
  );
});
