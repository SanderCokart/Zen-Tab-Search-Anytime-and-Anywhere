import { ActiveTimersList } from "@/features/timers/ui/ActiveTimersList";
import type { TabTimer } from "@/shared/types";
import { clearButtonClass } from "@/shared/ui/button-styles";
import { cn } from "@/shared/ui/cn";

export interface TimersDockProps {
  timers: ReadonlyMap<number, TabTimer>;
  onClearAll: () => void;
  onClearTimer: (tabId: number) => void;
  onActivateTimer: (tabId: number) => void;
  onEditTimer?: (tabId: number) => void;
  /** A custom colour; left out, the card takes its colour from the theme. */
  backgroundColor?: string;
}

/**
 * The "Timers" card under the todo column: one large LCD for the timer that ends
 * first, then a compact row per running timer. It reads the same timers the
 * "Active timers" drawer does and acts through the same handlers.
 */
export function TimersDock({
  timers,
  onClearAll,
  onClearTimer,
  onActivateTimer,
  onEditTimer,
  backgroundColor,
}: TimersDockProps) {
  const sorted = [...timers.values()].sort((a, b) => a.endAt - b.endAt);

  return (
    <aside
      class="zs-card flex min-h-0 min-w-0 shrink flex-col overflow-hidden p-[var(--zen-space-5)]"
      style={{ backgroundColor }}
      data-testid="zen-timers-dock"
    >
      <div class="zs-head">
        <span class="zs-head-glyph" aria-hidden="true">
          ⏱
        </span>
        <strong class="min-w-0 truncate font-[inherit] font-medium">Timers</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        {sorted.length > 1 && (
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
      <div class="zen-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <ActiveTimersList
          showLcd
          timers={sorted}
          onClearTimer={onClearTimer}
          onActivateTimer={onActivateTimer}
          onEditTimer={onEditTimer}
        />
      </div>
    </aside>
  );
}
