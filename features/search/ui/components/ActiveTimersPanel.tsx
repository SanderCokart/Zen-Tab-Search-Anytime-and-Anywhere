import { formatTimerCountdown } from "@/features/timers/model/timer";
import { clearButtonClass } from "@/features/search/ui/lib/styles";
import type { TabTimer } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export interface ActiveTimersPanelProps {
  timers: Map<number, TabTimer>;
  onClearAll: () => void;
  onClearTimer: (tabId: number) => void;
  onActivateTimer: (tabId: number) => void;
}

/** The "Active timers" drawer under the search input. */
export function ActiveTimersPanel({
  timers,
  onClearAll,
  onClearTimer,
  onActivateTimer,
}: ActiveTimersPanelProps) {
  const sorted = [...timers.values()].sort((a, b) => a.endAt - b.endAt);

  return (
    <div class="border-zen-accent bg-zen-panel mb-[var(--zen-space-2)] rounded-[var(--zen-radius)] border p-[var(--zen-space-2)]">
      <div class="mb-[var(--zen-space-2)] flex items-center justify-between gap-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]">
        <strong>Active timers</strong>
        {sorted.length > 0 && (
          <button
            type="button"
            class={cn(clearButtonClass, "px-[var(--zen-space-2)] py-[var(--zen-space-1)]")}
            onClick={onClearAll}
          >
            Clear all
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p class="text-zen-muted m-0 text-[length:var(--zen-text-sm)]">No active timers.</p>
      ) : (
        <ul class="zen-scroll m-0 flex max-h-[calc(var(--zen-font-size)*14)] list-none flex-col gap-[var(--zen-space-1)] overflow-y-auto p-0">
          {sorted.map((timer) => (
            <li key={timer.tabId} class="flex items-center gap-[var(--zen-space-2)]">
              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
                onClick={() => onActivateTimer(timer.tabId)}
              >
                <span class="max-w-full truncate">
                  {timer.title || timer.originalLabel || `Tab ${timer.tabId}`}
                </span>
                <span class="text-zen-lavender text-[length:var(--zen-text-xs)]">
                  ⏱ {formatTimerCountdown(timer.endAt)}
                </span>
              </button>
              <button
                type="button"
                class={cn(clearButtonClass, "px-[var(--zen-space-2)] py-[var(--zen-space-1)]")}
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
