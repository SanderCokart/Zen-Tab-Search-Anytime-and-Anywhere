import { parseDate, parseDuration } from "@timelang/parse";

export const MAX_TIMER_MS = 31 * 24 * 60 * 60_000;
export const TIMER_PREFIX_RE =
  /^⏱\s+(?:(?:\d+d(?:\s+\d+h)?(?:\s+\d+m)?)|(?:\d+h(?:\s+\d+m)?)|(?:\d+m(?:\s+\d+s)?)|\d+s|\d+:\d+(?::\d+)?)(?:\s*\|\s*)?/;

export interface TimerPreset {
  id: string;
  label: string;
  endAt: (now?: Date) => number;
}

function unit(value: number, singular: string, plural = `${singular}s`): string {
  return value === 1 ? `1 ${singular}` : `${value} ${plural}`;
}

export function stripTimerPrefix(label: string): string {
  return label.replace(TIMER_PREFIX_RE, "").trim();
}

export function formatCompactDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

export function formatHumanDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(unit(days, "day"));
    if (hours > 0) {
      parts.push(unit(hours, "hour"));
    }
    return parts.join(" ");
  }
  if (hours > 0) {
    parts.push(unit(hours, "hour"));
    if (minutes > 0) {
      parts.push(unit(minutes, "minute"));
    }
    return parts.join(" ");
  }
  if (minutes > 0) {
    parts.push(unit(minutes, "minute"));
    if (minutes < 5 || seconds > 0) {
      parts.push(unit(seconds, "second"));
    }
    return parts.join(" ");
  }
  return unit(seconds, "second");
}

export function formatTimerClock(milliseconds: number): string {
  return formatCompactDuration(milliseconds);
}

export function formatTimerLabel(milliseconds: number): string {
  return `⏱ ${formatTimerClock(milliseconds)}`;
}

export function composeTimerLabel(
  milliseconds: number,
  originalLabel: string,
  fallbackTitle = "",
): string {
  const clock = formatTimerLabel(milliseconds);
  const base = stripTimerPrefix(originalLabel || fallbackTitle);
  return base ? `${clock} | ${base}` : clock;
}

export function formatTimerEndTime(endAt: number, _now = Date.now()): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(endAt));
}

export function formatTimerCountdown(endAt: number, now = Date.now()): string {
  const remaining = Math.max(0, endAt - now);
  return `in ${formatHumanDuration(remaining)} · ${formatTimerEndTime(endAt, now)}`;
}

export function toDatetimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return Number.NaN;
  }
  const [, year, month, day, hour, minute] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  ).getTime();
}

export function isAllowedTimerEnd(endAt: number, now = Date.now()): boolean {
  return Number.isFinite(endAt) && endAt > now && endAt - now <= MAX_TIMER_MS;
}

export function parseTimerInput(input: string, now = new Date()): number | null {
  const value = input.trim();
  if (!value) {
    return null;
  }

  const duration = parseDuration(value, { referenceDate: now });
  if (duration !== null) {
    return now.getTime() + duration;
  }

  const date = parseDate(value, { referenceDate: now });
  if (!date) {
    return null;
  }

  // timelang represents parsed calendar values in UTC. Convert those wall-clock
  // components to the browser's local timezone before storing the timestamp.
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ).getTime();
}

function atTimeOnDay(base: Date, daysAhead: number, hours: number, minutes: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export const TIMER_PRESETS: TimerPreset[] = [
  {
    id: "30-minutes",
    label: "30 minutes",
    endAt: (now = new Date()) => now.getTime() + 30 * 60_000,
  },
  {
    id: "1-hour",
    label: "1 hour",
    endAt: (now = new Date()) => now.getTime() + 60 * 60_000,
  },
  {
    id: "7-hours",
    label: "7 hours",
    endAt: (now = new Date()) => now.getTime() + 7 * 60 * 60_000,
  },
  {
    id: "tomorrow",
    label: "Tomorrow 9:00",
    endAt: (now = new Date()) => {
      const tomorrow = atTimeOnDay(now, 1, 9, 0);
      if (tomorrow.getTime() <= now.getTime()) {
        tomorrow.setDate(tomorrow.getDate() + 1);
      }
      return tomorrow.getTime();
    },
  },
  {
    id: "next-week",
    label: "Next week",
    endAt: (now = new Date()) => now.getTime() + 7 * 24 * 60 * 60_000,
  },
  {
    id: "next-month",
    label: "Next month",
    endAt: (now = new Date()) => {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);
      return next.getTime();
    },
  },
];
