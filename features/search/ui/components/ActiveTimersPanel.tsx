import { clearButtonClass } from "@/features/search/ui/lib/styles";
import { ActiveTimersList } from "@/features/timers/ui/ActiveTimersList";
import type { TabTimer } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export interface ActiveTimersPanelProps {
  timers: Map<number, TabTimer>;
  onClearAll: () => void;
  onClearTimer: (tabId: number) => void;
  onActivateTimer: (tabId: number) => void;
  /** Opens the timer controls for that tab; the button is left out without it. */
  onEditTimer?: (tabId: number) => void;
  /** Skip the card, for a parent that already draws one. */
  bare?: boolean;
}

/** The "Active timers" drawer under the search input, or the timers view body when `bare`. */
export function ActiveTimersPanel({
  timers,
  onClearAll,
  onClearTimer,
  onActivateTimer,
  onEditTimer,
  bare = false,
}: ActiveTimersPanelProps) {
  const sorted = [...timers.values()].sort((a, b) => a.endAt - b.endAt);

  return (
    <div class={cn(!bare && "zs-card mb-[var(--zen-space-2)] p-[var(--zen-space-4)]")}>
      <div class="zs-head">
        <span class="zs-head-glyph" aria-hidden="true">
          ⏱
        </span>
        <strong class="min-w-0 truncate font-[inherit] font-medium">Active timers</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        {sorted.length > 0 && (
          <button
            type="button"
            class={cn(
              clearButtonClass,
              "h-[var(--zen-mini-key)] px-[var(--zen-space-3)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.1em] uppercase",
            )}
            onClick={onClearAll}
          >
            Clear all
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p class="text-zen-muted m-0 text-[length:var(--zen-text-sm)]">No active timers.</p>
      ) : (
        <ActiveTimersList
          showLcd
          timers={sorted}
          onClearTimer={onClearTimer}
          onActivateTimer={onActivateTimer}
          onEditTimer={onEditTimer}
        />
      )}
    </div>
  );
}
