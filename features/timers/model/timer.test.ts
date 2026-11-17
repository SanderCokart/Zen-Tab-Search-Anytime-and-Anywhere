import { describe, expect, it } from "vitest";
import {
  formatLcdCountdown,
  formatShortCountdown,
  composeTimerLabel,
  durationParts,
  endAtFromDuration,
  formatHumanDuration,
  formatTimerCountdown,
  formatTimerEndSentence,
  formatTimerEndShort,
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  parseTimerInput,
  stripTimerPrefix,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "@/features/timers/model/timer";

describe("stripTimerPrefix", () => {
  it("restores the original custom label", () => {
    expect(stripTimerPrefix("⏱ 4:59 | My Label")).toBe("My Label");
    expect(stripTimerPrefix("⏱ 2h | My Label")).toBe("My Label");
  });

  it("clears a timer-only label", () => {
    expect(stripTimerPrefix("⏱ 0:09")).toBe("");
    expect(stripTimerPrefix("⏱ 45s")).toBe("");
  });
});

describe("composeTimerLabel", () => {
  it("prepends the compact countdown to the original label", () => {
    expect(composeTimerLabel(90_000, "My Label")).toBe("⏱ 1m 30s | My Label");
    expect(composeTimerLabel(2 * 60 * 60_000, "My Label")).toBe("⏱ 2h | My Label");
  });

  it("falls back to the tab title when there is no custom label", () => {
    expect(composeTimerLabel(90_000, "", "GitHub issue")).toBe("⏱ 1m 30s | GitHub issue");
  });
});

describe("formatHumanDuration", () => {
  it("uses full words for the remaining time", () => {
    expect(formatHumanDuration(45_000)).toBe("45 seconds");
    expect(formatHumanDuration(90_000)).toBe("1 minute 30 seconds");
    expect(formatHumanDuration(2 * 60 * 60_000 + 5 * 60_000)).toBe("2 hours 5 minutes");
    expect(formatHumanDuration(26 * 60 * 60_000)).toBe("1 day 2 hours");
  });
});

describe("datetime local conversion", () => {
  it("round-trips a local datetime without seconds", () => {
    const stamp = new Date(2026, 8, 15, 17, 30, 0, 0).getTime();
    expect(toDatetimeLocalValue(stamp)).toBe("2026-09-15T17:30");
    expect(fromDatetimeLocalValue("2026-09-15T17:30")).toBe(stamp);
  });
});

describe("parseTimerInput", () => {
  const now = new Date(2026, 8, 15, 10, 0, 0, 0);

  it("parses natural language dates", () => {
    expect(parseTimerInput("tomorrow at 9 am", now)).toBe(
      new Date(2026, 8, 16, 9, 0, 0, 0).getTime(),
    );
  });

  it("parses relative durations from the reference time", () => {
    expect(parseTimerInput("1d 30m", now)).toBe(now.getTime() + 24.5 * 60 * 60_000);
  });

  it("returns null for blank or unsupported input", () => {
    expect(parseTimerInput(" ", now)).toBeNull();
    expect(parseTimerInput("sometime maybe", now)).toBeNull();
  });

  it("reads the preset labels", () => {
    expect(parseTimerInput("30 minutes", now)).toBe(now.getTime() + 30 * 60_000);
    expect(parseTimerInput("1 hour", now)).toBe(now.getTime() + 60 * 60_000);
    expect(parseTimerInput("7 hours", now)).toBe(now.getTime() + 7 * 60 * 60_000);
    expect(parseTimerInput("Tomorrow 9:00", now)).toBe(new Date(2026, 8, 16, 9, 0, 0, 0).getTime());
    expect(parseTimerInput("Next week", now)).not.toBeNull();
    expect(parseTimerInput("Next month", now)).not.toBeNull();
  });
});

describe("duration parts", () => {
  const now = new Date(2026, 10, 17, 9, 0, 0, 0).getTime();

  it("splits a remaining time into days, hours and minutes", () => {
    expect(durationParts(now + (14 * 60 + 19) * 60_000, now)).toEqual({
      days: 0,
      hours: 14,
      minutes: 19,
    });
    expect(durationParts(now + (26 * 60 + 3) * 60_000 + 59_000, now)).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
    });
  });

  it("builds an end time and clamps each part to its field", () => {
    expect(endAtFromDuration({ days: 1, hours: 2, minutes: 3 }, now)).toBe(
      now + (26 * 60 + 3) * 60_000,
    );
    expect(endAtFromDuration({ days: 0, hours: 99, minutes: -4 }, now)).toBe(
      now + 23 * 60 * 60_000,
    );
  });
});

describe("timer end phrases", () => {
  const end = new Date(2026, 10, 17, 9, 0, 0, 0).getTime();

  it("formats the short and sentence forms in en-US", () => {
    expect(formatTimerEndShort(end, "en-US")).toBe("Tue 9:00 AM");
    expect(formatTimerEndSentence(end, "en-US")).toBe("Ends Tuesday, Nov 17 at 9:00 AM");
  });
});

describe("formatTimerCountdown", () => {
  it("combines remaining time with the target clock", () => {
    const now = new Date(2026, 8, 15, 9, 0, 0, 0).getTime();
    const endAt = now + 90 * 60_000;
    expect(formatTimerCountdown(endAt, now)).toContain("in 1 hour 30 minutes");
    expect(formatTimerCountdown(endAt, now)).toContain("·");
  });
});

describe("TIMER_PRESETS", () => {
  it("creates future ends within the allowed range", () => {
    const now = new Date(2026, 8, 15, 10, 0, 0, 0);
    for (const preset of TIMER_PRESETS) {
      expect(isAllowedTimerEnd(preset.endAt(now), now.getTime())).toBe(true);
    }
    expect(TIMER_PRESETS.find((preset) => preset.id === "tomorrow")?.endAt(now)).toBe(
      new Date(2026, 8, 16, 9, 0, 0, 0).getTime(),
    );
  });
});

describe("isAllowedTimerEnd", () => {
  it("rejects timers longer than the maximum window", () => {
    const now = 1_000_000;
    expect(isAllowedTimerEnd(now + MAX_TIMER_MS + 1, now)).toBe(false);
    expect(isAllowedTimerEnd(now + MAX_TIMER_MS, now)).toBe(true);
  });
});

describe("formatShortCountdown", () => {
  const minute = 60_000;
  const hour = 60 * minute;

  it("stays on one short token at every scale", () => {
    expect(formatShortCountdown(0)).toBe("0s");
    expect(formatShortCountdown(45_000)).toBe("45s");
    expect(formatShortCountdown(27 * minute + 40_000)).toBe("27m 40s");
    expect(formatShortCountdown(5 * minute + 3_000)).toBe("5m 03s");
    expect(formatShortCountdown(8 * hour)).toBe("8h 00m");
    expect(formatShortCountdown(2 * hour + 5 * minute)).toBe("2h 05m");
    expect(formatShortCountdown(51 * hour)).toBe("2d 03h");
  });

  it("never goes negative", () => {
    expect(formatShortCountdown(-5_000)).toBe("0s");
  });
});

describe("formatLcdCountdown", () => {
  it("reads as a clock under an hour and as the short form above", () => {
    expect(formatLcdCountdown(27 * 60_000 + 40_000)).toBe("27:40");
    expect(formatLcdCountdown(9_000)).toBe("00:09");
    expect(formatLcdCountdown(8 * 3_600_000)).toBe("8h 00m");
  });
});
