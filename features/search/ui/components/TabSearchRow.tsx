import { useState } from "preact/hooks";
import { formatTimerCountdown, stripTimerPrefix } from "@/features/timers/model/timer";
import { TimerForm } from "@/features/timers/ui/TimerForm";
import { hostname } from "@/features/search/ui/lib/format";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import type { TabInfo, TabTimer } from "@/shared/types";
import { formatTabDisplayTitle, isEssentialTab, tabBrowserId } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export function TabSearchRow({
  tab,
  timer,
  timerOpen,
  compact,
  displayTitle,
  onToggleTimer,
  onOpenTimerPopup,
  onSetTimer,
  onClearTimer,
}: {
  tab: TabInfo;
  timer?: TabTimer;
  timerOpen: boolean;
  compact: boolean;
  displayTitle?: string;
  onToggleTimer: () => void;
  onOpenTimerPopup: () => void;
  onSetTimer: (endAt: number) => void;
  onClearTimer: () => void;
}) {
  const tabId = tabBrowserId(tab);
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);

  return (
    <>
      {tab.favIconUrl && (
        <img
          src={tab.favIconUrl}
          class={cn("shrink-0 rounded-sm", compact ? "mt-px size-4" : "size-[24px] rounded")}
        />
      )}
      <div class="flex min-w-0 flex-1 flex-col gap-px">
        <div class={cn("flex min-w-0 flex-col", compact ? "gap-1.5" : "gap-2")}>
          <div class="flex min-w-0 items-center gap-2">
            <span class={cn("min-w-0 flex-1 truncate", !compact && "text-[16px]")}>
              {displayTitle ??
                formatTabDisplayTitle({
                  ...tab,
                  customLabel: stripTimerPrefix(tab.customLabel || ""),
                })}
            </span>
            <span
              class={cn(
                "text-zen-lavender ml-auto flex shrink-0 items-center justify-end gap-1",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              {timer && !isEssentialTab(tab) && <span>⏱ {formatTimerCountdown(timer.endAt)}</span>}
            </span>
          </div>
          {timerOpen && tabId !== undefined && (
            <TimerForm timer={timer} compact={compact} onSet={onSetTimer} onClear={onClearTimer} />
          )}
        </div>
        <div
          class={cn(
            "text-zen-subtle flex min-w-0 items-center justify-between gap-1",
            compact ? "text-[11px]" : "text-[14px]",
            timerOpen && "pt-5",
          )}
        >
          <span class="truncate">
            {tab.active
              ? `${tab.workspaceName || hostname(tab.url)} · Current tab`
              : tab.workspaceName || hostname(tab.url)}
          </span>
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
                    onOpenTimerPopup();
                  } else {
                    onToggleTimer();
                  }
                }}
              >
                <TimerIcon
                  close={timerOpen}
                  class={cn(timer && "text-zen-border", compact ? "size-[11px]" : "size-[14px]")}
                />
              </button>
              <span
                class={cn(
                  "bg-zen-tooltip pointer-events-none absolute right-0 bottom-full z-10 mb-1 w-max max-w-[220px] rounded px-2 py-1 text-xs opacity-0 shadow transition-opacity",
                  !tooltipSuppressed && "opacity-0 group-hover:opacity-100",
                )}
                role="tooltip"
              >
                {timer
                  ? `Timer: ${formatTimerCountdown(timer.endAt)}`
                  : isEssentialTab(tab)
                    ? "Open timer popup"
                    : timerOpen
                      ? "Close timer controls"
                      : "Open timer controls"}
              </span>
            </span>
          )}
        </div>
      </div>
    </>
  );
}
