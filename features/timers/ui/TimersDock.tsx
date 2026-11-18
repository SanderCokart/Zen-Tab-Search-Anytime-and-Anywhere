import { selectDockTimers } from "@/features/timers/model/dock";
import { ActiveTimersList, SoonestTimerLcd } from "@/features/timers/ui/ActiveTimersList";
import type { TabTimer } from "@/shared/types";
import { clearButtonClass } from "@/shared/ui/button-styles";
import { cn } from "@/shared/ui/cn";

export interface TimersDockProps {
  timers: ReadonlyMap<number, TabTimer>;
  onClearAll: () => void;
  onClearTimer: (tabId: number) => void;
  onActivateTimer: (tabId: number) => void;
  onEditTimer?: (tabId: number) => void;
}

/**
 * The "Timers" card at the bottom of the todo column: one large LCD for the timer
 * that ends first, then a compact row for each of the next two. Timers beyond
 * those three are only in the "Active timers" drawer. The card takes only the
 * height it needs; the todos above it take the rest.
 */
export function TimersDock({
  timers,
  onClearAll,
  onClearTimer,
  onActivateTimer,
  onEditTimer,
}: TimersDockProps) {
  const { soonest, upcoming } = selectDockTimers(timers.values());

  return (
    <aside
      class="zs-card flex min-w-0 shrink-0 flex-col overflow-hidden p-[var(--zen-space-5)]"
      data-testid="zen-timers-dock"
    >
      <div class="zs-head">
        <span class="zs-head-glyph" aria-hidden="true">
          ⏱
        </span>
        <strong class="min-w-0 truncate font-[inherit] font-medium">Timers</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        {timers.size > 1 && (
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
      <div class="flex min-w-0 flex-col gap-[var(--zen-space-2)]">
        {soonest && (
          <SoonestTimerLcd
            timer={soonest}
            onEdit={onEditTimer}
            onClear={onClearTimer}
            onActivate={onActivateTimer}
          />
        )}
        <ActiveTimersList
          timers={upcoming}
          onClearTimer={onClearTimer}
          onActivateTimer={onActivateTimer}
          onEditTimer={onEditTimer}
        />
      </div>
    </aside>
  );
}
