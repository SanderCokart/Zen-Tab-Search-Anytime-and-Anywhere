import { describe, expect, it } from "vitest";
import {
  composeTimerLabel,
  formatHumanDuration,
  formatTimerCountdown,
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  stripTimerPrefix,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "../lib/timer";

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
