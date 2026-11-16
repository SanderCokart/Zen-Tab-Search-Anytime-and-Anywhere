import { useEffect, useState } from "preact/hooks";
import {
  formatLcdCountdown,
  formatShortCountdown,
  formatTimerCountdown,
} from "@/features/timers/model/timer";

const listeners = new Set<() => void>();
let intervalId: number | undefined;

function subscribeTimerTick(listener: () => void): () => void {
  listeners.add(listener);
  if (intervalId === undefined) {
    intervalId = window.setInterval(() => {
      for (const current of listeners) {
        current();
      }
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== undefined) {
      window.clearInterval(intervalId);
      intervalId = undefined;
    }
  };
}

export type TimerCountdownFormat = "full" | "short" | "lcd";

function formatCountdown(endAt: number, format: TimerCountdownFormat): string {
  const remaining = Math.max(0, endAt - Date.now());
  if (format === "short") return formatShortCountdown(remaining);
  if (format === "lcd") return formatLcdCountdown(remaining);
  return formatTimerCountdown(endAt);
}

/**
 * Live countdown text that ticks without re-rendering the surrounding row.
 * `full` is the sentence with the end date (tooltips); `short` and `lcd` are the
 * single tokens rows, chips and the big readout use.
 */
export function TimerCountdown({
  endAt,
  prefix = "⏱ ",
  format = "full",
}: {
  endAt: number;
  prefix?: string;
  format?: TimerCountdownFormat;
}) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeTimerTick(() => setTick((tick) => tick + 1)), []);
  return (
    <>
      {prefix}
      {formatCountdown(endAt, format)}
    </>
  );
}
