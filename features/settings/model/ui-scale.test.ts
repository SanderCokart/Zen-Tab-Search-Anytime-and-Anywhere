import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import {
  MAX_FONT_SIZE,
  MAX_SPACING,
  SPACING_SETTINGS,
  clampSpacing,
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

  it("clamps spacing to 0-2, falling back to 1 rather than to the minimum", () => {
    expect(clampSpacing(9)).toBe(MAX_SPACING);
    expect(clampSpacing(-1)).toBe(0);
    expect(clampSpacing(0)).toBe(0);
    // 0 is a legitimate setting, so a corrupt value must not collapse every gap.
    expect(clampSpacing(Number.NaN)).toBe(1);
  });

  it("emits the base properties plus one per spacing setting", () => {
    const style = uiScaleStyle(
      settings({ fontSize: 12, uiScale: 1.25, respectZoom: true, tabGap: 0, issuePadding: 1.5 }),
      "overlay",
    );

    expect(style["--zen-font-size"]).toBe("12px");
    expect(style["--zen-scale"]).toBe("1.25");
    expect(style["--zen-row-gap-scale"]).toBe("0");
    expect(style["--zen-issue-padding-scale"]).toBe("1.5");
    expect(Object.keys(style)).toHaveLength(2 + SPACING_SETTINGS.length);
  });

  it("gives every spacing setting a distinct custom property", () => {
    const keys = SPACING_SETTINGS.map(([key]) => key);
    const properties = SPACING_SETTINGS.map(([, property]) => property);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(properties).size).toBe(properties.length);
  });
});
