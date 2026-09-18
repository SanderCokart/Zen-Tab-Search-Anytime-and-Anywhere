import { formatTimerCountdown } from "@/features/timers/model/timer";
import { clearButtonClass } from "@/features/search/ui/lib/styles";
import type { TabTimer } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export interface ActiveTimersPanelProps {
  timers: Map<number, TabTimer>;
  compact: boolean;
  onClearAll: () => void;
  onClearTimer: (tabId: number) => void;
  onActivateTimer: (tabId: number) => void;
}

/** The "Active timers" drawer under the search input. */
export function ActiveTimersPanel({
  timers,
  compact,
  onClearAll,
  onClearTimer,
  onActivateTimer,
}: ActiveTimersPanelProps) {
  const sorted = [...timers.values()].sort((a, b) => a.endAt - b.endAt);

  return (
    <div
      class={cn(
        "border-zen-accent bg-zen-panel rounded-lg border",
        compact ? "mb-2 p-2" : "mb-[12px] rounded-[10px] p-[12px]",
      )}
    >
      <div
        class={cn(
          "mb-2 flex items-center justify-between gap-2",
          compact ? "text-xs" : "text-[14px]",
        )}
      >
        <strong>Active timers</strong>
        {sorted.length > 0 && (
          <button
            type="button"
            class={cn(clearButtonClass, compact ? "px-1.5 py-0.5" : "px-2.5 py-1.5")}
            onClick={onClearAll}
          >
            Clear all
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p class={cn("text-zen-muted m-0", compact ? "text-xs" : "text-[13px]")}>
          No active timers.
        </p>
      ) : (
        <ul
          class={cn(
            "zen-scroll m-0 flex list-none flex-col overflow-y-auto p-0",
            compact ? "max-h-[180px] gap-1.5" : "max-h-[220px] gap-[8px]",
          )}
        >
          {sorted.map((timer) => (
            <li key={timer.tabId} class="flex items-center gap-2">
              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
                onClick={() => onActivateTimer(timer.tabId)}
              >
                <span class="max-w-full truncate">
                  {timer.title || timer.originalLabel || `Tab ${timer.tabId}`}
                </span>
                <span class={cn("text-zen-lavender", compact ? "text-[11px]" : "text-[12px]")}>
                  ⏱ {formatTimerCountdown(timer.endAt)}
                </span>
              </button>
              <button
                type="button"
                class={cn(clearButtonClass, compact ? "px-1.5 py-0.5" : "px-2.5 py-1.5")}
                onClick={() => onClearTimer(timer.tabId)}
              >
                Clear
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
