import { useEffect, useState } from "preact/hooks";
import { formatTimerCountdown } from "@/features/timers/model/timer";

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

/** Live countdown text that ticks without re-rendering the surrounding row. */
export function TimerCountdown({ endAt, prefix = "⏱ " }: { endAt: number; prefix?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeTimerTick(() => setTick((tick) => tick + 1)), []);
  return (
    <>
      {prefix}
      {formatTimerCountdown(endAt)}
    </>
  );
}
