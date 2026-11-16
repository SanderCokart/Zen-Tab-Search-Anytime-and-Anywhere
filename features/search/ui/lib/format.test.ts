import { describe, expect, it } from "vitest";
import { formatShortAge } from "@/features/search/ui/lib/format";

describe("formatShortAge", () => {
  it.each([
    [0, "now"],
    [59_000, "now"],
    [43 * 60_000, "43m"],
    [60 * 60_000, "1h"],
    [5 * 3_600_000 + 1, "5h"],
    [2 * 86_400_000, "2d"],
    [14 * 86_400_000, "2w"],
    [40 * 86_400_000, "1mo"],
    [400 * 86_400_000, "1y"],
  ])("%d ms is %s", (ms, expected) => {
    expect(formatShortAge(ms)).toBe(expected);
  });

  it("treats a future timestamp as now", () => {
    expect(formatShortAge(-5_000)).toBe("now");
  });
});
