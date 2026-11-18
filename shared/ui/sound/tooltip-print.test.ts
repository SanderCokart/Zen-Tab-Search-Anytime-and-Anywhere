import { describe, expect, it, vi } from "vitest";
import {
  previewPrint,
  scheduleTooltipPrint,
  TOOLTIP_PRINT_MS,
  TOOLTIP_PRINT_VOICE,
  tooltipPrintSchedule,
} from "@/shared/ui/sound/tooltip-print";

describe("tooltip print sounds", () => {
  it("staggers one click per character on the LCD print delay", () => {
    expect(tooltipPrintSchedule("Go", false)).toEqual([
      { at: 0, voice: TOOLTIP_PRINT_VOICE },
      { at: TOOLTIP_PRINT_MS, voice: TOOLTIP_PRINT_VOICE },
    ]);
  });

  it("keeps one click per character so a long legend does not go quiet mid-print", () => {
    const label = "Separates each folder section from what comes before it.";
    const ticks = tooltipPrintSchedule(label, false);
    expect(ticks).toHaveLength([...label].length);
    expect(ticks.at(-1)?.at).toBe((label.length - 1) * TOOLTIP_PRINT_MS);
  });

  it("stays silent when motion is reduced, because the letters appear at once", () => {
    expect(tooltipPrintSchedule("Mark as todo", true)).toEqual([]);
  });

  it("plays on the stagger and cancels leftover clicks when the legend closes", () => {
    vi.useFakeTimers();
    const play = vi.fn();
    const cancel = scheduleTooltipPrint("ab ", play, false);
    vi.advanceTimersByTime(TOOLTIP_PRINT_MS);
    expect(play.mock.calls).toEqual([[TOOLTIP_PRINT_VOICE], [TOOLTIP_PRINT_VOICE]]);
    cancel();
    vi.advanceTimersByTime(TOOLTIP_PRINT_MS);
    expect(play).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("previews a print voice as a short stagger of that timbre", () => {
    vi.useFakeTimers();
    const play = vi.fn();
    previewPrint(play, "print-3", 3);
    vi.advanceTimersByTime(TOOLTIP_PRINT_MS * 2);
    expect(play.mock.calls).toEqual([["print-3"], ["print-3"], ["print-3"]]);
    vi.useRealTimers();
  });
});
