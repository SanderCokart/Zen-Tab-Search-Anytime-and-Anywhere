import { formatTimerEndTime } from "@/features/timers/model/timer";
import { TimerCountdown } from "@/features/timers/ui/TimerCountdown";
import type { TabTimer } from "@/shared/types";
import { clearButtonClass } from "@/shared/ui/button-styles";
import { cn } from "@/shared/ui/cn";
import { Lcd } from "@/shared/ui/primitives/Lcd";

export interface ActiveTimersListProps {
  /** Already sorted by the caller (soonest `endAt` first). */
  timers: readonly TabTimer[];
  onClearTimer: (tabId: number) => void;
  onActivateTimer: (tabId: number) => void;
  /** Opens the timer controls for that tab; the button is left out without it. */
  onEditTimer?: (tabId: number) => void;
  /** Put one large readout of the soonest timer above the rows. */
  showLcd?: boolean;
}

/** What a timer is called: its tab title, then the label it had before the countdown. */
function timerName(timer: TabTimer): string {
  return timer.title || timer.originalLabel || `Tab ${timer.tabId}`;
}

const keyClass = cn(
  clearButtonClass,
  "h-[var(--zen-mini-key)] px-[var(--zen-space-2)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.1em] uppercase",
);

const lcdActionClass =
  "cursor-pointer border-0 bg-transparent p-0 font-mono text-[length:var(--zen-text-xs)] tracking-[0.12em] text-[var(--zs-lcd-dim)] uppercase hover:text-[var(--zs-lcd-ink)]";

/** One large LCD readout for a timer: its name, the big countdown and its end time. */
export function SoonestTimerLcd({
  timer,
  onEdit,
  onClear,
}: {
  timer: TabTimer;
  onEdit?: (tabId: number) => void;
  onClear?: (tabId: number) => void;
}) {
  return (
    <Lcd
      class="flex min-w-0 flex-col gap-[var(--zen-space-2)] px-[var(--zen-space-4)] py-[var(--zen-space-4)]"
      data-testid="zen-timers-dock-soonest"
    >
      <span class="truncate text-[length:var(--zen-text-xs)] tracking-[0.06em] text-[var(--zs-lcd-dim)] uppercase">
        Next · {timerName(timer)}
      </span>
      <span class="zs-digits text-[length:var(--zen-text-display)] leading-none font-medium whitespace-nowrap">
        <TimerCountdown endAt={timer.endAt} prefix="" format="lcd" />
      </span>
      <div class="flex min-w-0 items-center justify-between gap-[var(--zen-space-3)]">
        <span class="truncate text-[length:var(--zen-text-xs)] tracking-[0.06em] text-[var(--zs-lcd-dim)] uppercase">
          {formatTimerEndTime(timer.endAt)}
        </span>
        <span class="flex shrink-0 items-center gap-[var(--zen-space-3)]">
          {onEdit && (
            <button type="button" class={lcdActionClass} onClick={() => onEdit(timer.tabId)}>
              Edit
            </button>
          )}
          {onClear && (
            <button type="button" class={lcdActionClass} onClick={() => onClear(timer.tabId)}>
              Clear
            </button>
          )}
        </span>
      </div>
    </Lcd>
  );
}

/**
 * The running timers: optionally one large LCD for the next one, then compact rows
 * of name, a short countdown chip and the Edit / Clear keys.
 */
export function ActiveTimersList({
  timers,
  onClearTimer,
  onActivateTimer,
  onEditTimer,
  showLcd = false,
}: ActiveTimersListProps) {
  const soonest = timers[0];

  return (
    <div class="flex min-w-0 flex-col gap-[var(--zen-space-2)]">
      {showLcd && soonest && <SoonestTimerLcd timer={soonest} />}
      <ul class="zen-scroll m-0 flex max-h-[calc(var(--zen-font-size)*17)] list-none flex-col overflow-y-auto p-0">
        {timers.map((timer) => (
          <li
            key={timer.tabId}
            class="flex min-h-[calc(var(--zen-row-height)*1.2)] items-center gap-[var(--zen-space-2)] px-[var(--zen-space-1)]"
          >
            <button
              type="button"
              class="zs-row-title flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-inherit"
              onClick={() => onActivateTimer(timer.tabId)}
            >
              {timerName(timer)}
            </button>
            <Lcd class="zs-digits shrink-0 rounded-[var(--zen-radius)] px-[var(--zen-space-3)] py-[var(--zen-space-1)] text-[length:var(--zen-text-sm)] font-medium whitespace-nowrap shadow-none">
              <TimerCountdown endAt={timer.endAt} prefix="" format="short" />
            </Lcd>
            {onEditTimer && (
              <button type="button" class={keyClass} onClick={() => onEditTimer(timer.tabId)}>
                Edit
              </button>
            )}
            <button type="button" class={keyClass} onClick={() => onClearTimer(timer.tabId)}>
              Clear
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
