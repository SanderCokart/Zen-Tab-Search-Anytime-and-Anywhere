import { describe, expect, it } from "vitest";
import { clampTooltipNudge } from "@/shared/ui/primitives/tooltip-layout";

describe("clampTooltipNudge", () => {
  const box = { left: 0, right: 200, top: 0, bottom: 200 };

  it("does nothing when the legend already fits", () => {
    expect(clampTooltipNudge({ left: 40, right: 120, top: 20, bottom: 40 }, box, 8)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("slides left when the legend hangs off the right edge", () => {
    expect(clampTooltipNudge({ left: 140, right: 220, top: 20, bottom: 40 }, box, 8)).toEqual({
      x: -28,
      y: 0,
    });
  });

  it("slides down when the legend hangs off the top", () => {
    expect(clampTooltipNudge({ left: 40, right: 80, top: -10, bottom: 10 }, box, 8)).toEqual({
      x: 0,
      y: 18,
    });
  });

  it("slides right when the legend hangs off the left edge", () => {
    expect(clampTooltipNudge({ left: -20, right: 40, top: 20, bottom: 40 }, box, 8)).toEqual({
      x: 28,
      y: 0,
    });
  });
});
