import { useState } from "preact/hooks";
import { formatTimerCountdown, stripTimerPrefix } from "@/features/timers/model/timer";
import { TimerForm } from "@/features/timers/ui/TimerForm";
import { hostname } from "@/features/search/ui/lib/format";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import type { TabInfo, TabTimer } from "@/shared/types";
import { formatTabDisplayTitle, isEssentialTab, tabBrowserId } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export function TabSearchRow({
  tab,
  timer,
  timerOpen,
  truncate,
  displayTitle,
  onToggleTimer,
  onOpenTimerPopup,
  onSetTimer,
  onClearTimer,
}: {
  tab: TabInfo;
  timer?: TabTimer;
  timerOpen: boolean;
  truncate: boolean;
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
              {timer && !isEssentialTab(tab) && <span>⏱ {formatTimerCountdown(timer.endAt)}</span>}
            </span>
          </div>
          {timerOpen && tabId !== undefined && (
            <TimerForm timer={timer} onSet={onSetTimer} onClear={onClearTimer} />
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
