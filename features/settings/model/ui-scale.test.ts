import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import {
  GAP_SETTINGS,
  GAP_STEP,
  MAX_FONT_SIZE,
  MAX_GAP,
  clampGap,
  clampGapPaddingRatio,
  splitGap,
  MAX_UI_SCALE,
  MIN_FONT_SIZE,
  MIN_UI_SCALE,
  clampFontSize,
  clampUiScale,
  cancelZoom,
  normalizeZoom,
  resolveBaseFontSize,
  stepFontSize,
  uiScaleStyle,
} from "@/features/settings/model/ui-scale";

const settings = (overrides: Partial<typeof DEFAULT_DISPLAY_SETTINGS> = {}) => ({
  ...DEFAULT_DISPLAY_SETTINGS,
  ...overrides,
});

describe("ui scale", () => {
  it("steps the font size one pixel per wheel notch, within range", () => {
    expect(stepFontSize(14, -100)).toBe(15);
    expect(stepFontSize(14, 100)).toBe(13);
    expect(stepFontSize(14, 0)).toBe(14);
    expect(stepFontSize(MAX_FONT_SIZE, -1)).toBe(MAX_FONT_SIZE);
    expect(stepFontSize(MIN_FONT_SIZE, 1)).toBe(MIN_FONT_SIZE);
    expect(stepFontSize(14, Number.NaN)).toBe(14);
  });

  it("clamps out-of-range and non-finite values", () => {
    expect(clampFontSize(999)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(Number.NaN)).toBe(MIN_FONT_SIZE);
    expect(clampUiScale(99)).toBe(MAX_UI_SCALE);
    expect(clampUiScale(0)).toBe(MIN_UI_SCALE);
    expect(clampUiScale(Number.POSITIVE_INFINITY)).toBe(MIN_UI_SCALE);
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

  it("keeps the popup windows on the plain px font size, whatever the zoom", () => {
    // Their own window zoom scales a px length, so no viewport maths is needed.
    expect(resolveBaseFontSize(settings({ fontSize: 20 }), "popup")).toBe("20px");
    expect(resolveBaseFontSize(settings({ fontSize: 20 }), "popup", 1.5)).toBe("20px");
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
      settings({ fontSize: 14, uiScale: 1.25, tabGap: 0, folderGap: 28, gapPaddingRatio: 0 }),
      "overlay",
    );

    expect(style["--zen-font-size"]).toBe("14px");
    expect(style["--zen-scale"]).toBe("1.25");
    expect(style["--zen-tab-gap-ratio"]).toBe("0");
    // 28px at the 14px reference is exactly two base font sizes, all of it gap at ratio 0.
    expect(style["--zen-folder-gap-ratio"]).toBe("2");
    expect(style["--zen-folder-pad-ratio"]).toBe("0");
    expect(Object.keys(style)).toHaveLength(2 + GAP_SETTINGS.length * 2);
  });

  it("splits each gap evenly into gap and padding at the default ratio", () => {
    const style = uiScaleStyle(settings({ fontSize: 14, folderGap: 28 }), "overlay");

    // 14px gap, and 7px of padding on each of the two neighbours.
    expect(style["--zen-folder-gap-ratio"]).toBe("1");
    expect(style["--zen-folder-pad-ratio"]).toBe("0.5");
  });

  it("gives more padding as the ratio turns up and more gap as it turns down", () => {
    expect(splitGap(20, 0)).toEqual({ gap: 20, padding: 0 });
    expect(splitGap(20, 1)).toEqual({ gap: 10, padding: 5 });
    expect(splitGap(20, 3)).toEqual({ gap: 5, padding: 7.5 });
    // The gap and both paddings always add back up to the space the slider set.
    for (const ratio of [0, 0.25, 1, 2.5, 4]) {
      const { gap, padding } = splitGap(24, ratio);
      expect(gap + padding * 2).toBeCloseTo(24);
    }
  });

  it("snaps the padding ratio to its step and holds it in range", () => {
    expect(clampGapPaddingRatio(1.1)).toBe(1);
    expect(clampGapPaddingRatio(-2)).toBe(0);
    expect(clampGapPaddingRatio(9)).toBe(4);
    expect(clampGapPaddingRatio(Number.NaN)).toBe(1);
  });

  it("gives every gap setting a distinct custom property", () => {
    const keys = GAP_SETTINGS.map(([key]) => key);
    const properties = GAP_SETTINGS.map(([, property]) => property);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(properties).size).toBe(properties.length);
  });
});
