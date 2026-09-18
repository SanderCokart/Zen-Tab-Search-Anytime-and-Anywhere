import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import {
  GAP_SETTINGS,
  GAP_STEP,
  MAX_FONT_SIZE,
  MAX_GAP,
  clampGap,
  MAX_UI_SCALE,
  MIN_FONT_SIZE,
  MIN_UI_SCALE,
  clampFontSize,
  clampUiScale,
  resolveBaseFontSize,
  uiScaleStyle,
} from "@/features/settings/model/ui-scale";

const settings = (overrides: Partial<typeof DEFAULT_DISPLAY_SETTINGS> = {}) => ({
  ...DEFAULT_DISPLAY_SETTINGS,
  ...overrides,
});

describe("ui scale", () => {
  it("clamps out-of-range and non-finite values", () => {
    expect(clampFontSize(999)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(Number.NaN)).toBe(MIN_FONT_SIZE);
    expect(clampUiScale(99)).toBe(MAX_UI_SCALE);
    expect(clampUiScale(0)).toBe(MIN_UI_SCALE);
    expect(clampUiScale(Number.POSITIVE_INFINITY)).toBe(MIN_UI_SCALE);
  });

  it("uses a plain px length when the overlay should follow the page zoom", () => {
    // CSS pixels in the overlay already scale with page zoom, so following the zoom
    // means doing nothing to them.
    expect(resolveBaseFontSize(settings({ fontSize: 14, respectZoom: true }), "overlay")).toBe(
      "14px",
    );
  });

  it("derives a zoom-independent size from the overlay's own box by default", () => {
    // The overlay is min(80vw, 90dvh) and the ramp is tuned against a 720px panel,
    // so a 16px base becomes min(1.778vw, 2dvh) — 16px on a 800px-tall window.
    expect(resolveBaseFontSize(settings({ fontSize: 16 }), "overlay")).toBe("min(1.778vw, 2dvh)");
  });

  it("keeps the zoom-independent size free of any px term", () => {
    // A px length anywhere in the expression would scale with page zoom and so
    // reintroduce exactly the dependence this mode removes.
    for (const fontSize of [MIN_FONT_SIZE, 16, MAX_FONT_SIZE]) {
      expect(resolveBaseFontSize(settings({ fontSize }), "overlay")).not.toContain("px");
    }
  });

  it("keeps the popup on a fixed px size a notch smaller, in both modes", () => {
    // The popup is browser UI with a fixed width, so page zoom never touches it.
    expect(resolveBaseFontSize(settings({ fontSize: 20 }), "popup")).toBe("16px");
    expect(resolveBaseFontSize(settings({ fontSize: 20, respectZoom: true }), "popup")).toBe(
      "16px",
    );
  });

  it("snaps gaps to the step and holds them in range", () => {
    expect(clampGap(999)).toBe(MAX_GAP);
    expect(clampGap(-8)).toBe(0);
    expect(clampGap(0)).toBe(0);
    expect(clampGap(10)).toBe(GAP_STEP * 3);
    expect(clampGap(13)).toBe(GAP_STEP * 3);
    // 0 is a legitimate gap, so a corrupt value falls back to the caller's default
    // rather than collapsing the gap.
    expect(clampGap(Number.NaN, 12)).toBe(12);
  });

  it("stores gaps as a ratio of the 16px reference, so the slider reads as pixels", () => {
    const style = uiScaleStyle(
      settings({ fontSize: 12, uiScale: 1.25, respectZoom: true, tabGap: 0, folderGap: 16 }),
      "overlay",
    );

    expect(style["--zen-font-size"]).toBe("12px");
    expect(style["--zen-scale"]).toBe("1.25");
    expect(style["--zen-tab-gap-ratio"]).toBe("0");
    // 16px at the 16px reference is exactly one base font size.
    expect(style["--zen-folder-gap-ratio"]).toBe("1");
    expect(Object.keys(style)).toHaveLength(2 + GAP_SETTINGS.length);
  });

  it("gives every gap setting a distinct custom property", () => {
    const keys = GAP_SETTINGS.map(([key]) => key);
    const properties = GAP_SETTINGS.map(([, property]) => property);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(properties).size).toBe(properties.length);
  });
});
