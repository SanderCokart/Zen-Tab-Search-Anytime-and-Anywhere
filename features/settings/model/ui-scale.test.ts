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
  cancelZoom,
  normalizeZoom,
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

  it("renders the configured size on screen by dividing out the tab zoom", () => {
    // A CSS px is `zoom` screen px, so 14px at 150% has to be 9.333 CSS px.
    expect(resolveBaseFontSize(settings({ fontSize: 14 }), "overlay", 1.5)).toBe("9.333px");
    expect(resolveBaseFontSize(settings({ fontSize: 14 }), "overlay", 0.5)).toBe("28px");
    expect(resolveBaseFontSize(settings({ fontSize: 14 }), "overlay", 1)).toBe("14px");
  });

  it("is the configured px size at any window size, because it reads no viewport unit", () => {
    for (const fontSize of [MIN_FONT_SIZE, 14, MAX_FONT_SIZE]) {
      expect(resolveBaseFontSize(settings({ fontSize }), "overlay", 1)).toBe(`${fontSize}px`);
      expect(resolveBaseFontSize(settings({ fontSize }), "overlay", 1.25)).not.toMatch(/vw|dvh/);
    }
  });

  it("treats a missing or nonsensical zoom as no zoom", () => {
    expect(resolveBaseFontSize(settings({ fontSize: 14 }), "overlay")).toBe("14px");
    expect(normalizeZoom(undefined)).toBe(1);
    expect(normalizeZoom(Number.NaN)).toBe(1);
    expect(normalizeZoom(0)).toBe(0.3);
    expect(normalizeZoom(99)).toBe(5);
    expect(cancelZoom(12, 2)).toBe(6);
  });

  it("leaves the plain px length alone when following the page zoom", () => {
    expect(resolveBaseFontSize(settings({ fontSize: 14, respectZoom: true }), "overlay", 1.5)).toBe(
      "14px",
    );
  });

  it("keeps the popup windows on the plain px font size, in both modes", () => {
    // Their own window zoom scales a px length, so no viewport maths is needed.
    expect(resolveBaseFontSize(settings({ fontSize: 20 }), "popup")).toBe("20px");
    expect(resolveBaseFontSize(settings({ fontSize: 20, respectZoom: true }), "popup")).toBe(
      "20px",
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

  it("stores gaps as a ratio of the 14px reference, so the slider reads as pixels", () => {
    const style = uiScaleStyle(
      settings({ fontSize: 14, uiScale: 1.25, respectZoom: true, tabGap: 0, folderGap: 28 }),
      "overlay",
    );

    expect(style["--zen-font-size"]).toBe("14px");
    expect(style["--zen-scale"]).toBe("1.25");
    expect(style["--zen-tab-gap-ratio"]).toBe("0");
    // 28px at the 14px reference is exactly two base font sizes.
    expect(style["--zen-folder-gap-ratio"]).toBe("2");
    expect(Object.keys(style)).toHaveLength(2 + GAP_SETTINGS.length);
  });

  it("gives every gap setting a distinct custom property", () => {
    const keys = GAP_SETTINGS.map(([key]) => key);
    const properties = GAP_SETTINGS.map(([, property]) => property);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(properties).size).toBe(properties.length);
  });
});
