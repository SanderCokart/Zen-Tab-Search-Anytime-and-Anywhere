import type { DisplaySettings } from "@/features/settings/model/display-settings";

/** The surfaces the search UI is rendered on. */
export type UiSurface = "popup" | "overlay";

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 22;
export const MIN_UI_SCALE = 0.7;
export const MAX_UI_SCALE = 1.5;
export const MIN_SPACING = 0;
export const MAX_SPACING = 2;

/**
 * The per-element spacing multipliers, paired with the custom property each one
 * feeds. They multiply the density-derived spacing rather than replacing it with a
 * pixel value, so a tightened row stays tightened when the font size or density
 * changes. This list is the single place the setting keys and the CSS properties
 * are tied together — `shared/ui/styles.css` consumes the properties, the options
 * page renders a slider per entry, and `uiScaleStyle` emits them.
 */
export const SPACING_SETTINGS = [
  ["tabGap", "--zen-row-gap-scale"],
  ["tabPadding", "--zen-row-padding-scale"],
  ["tileGap", "--zen-tile-gap-scale"],
  ["tilePadding", "--zen-tile-padding-scale"],
  ["issueGap", "--zen-issue-gap-scale"],
  ["issuePadding", "--zen-issue-padding-scale"],
] as const;

export type SpacingSettingKey = (typeof SPACING_SETTINGS)[number][0];

/** The toolbar popup is a fixed 380px panel, so it runs a notch tighter than the overlay. */
const POPUP_FONT_FACTOR = 0.8;

/**
 * Panel size the zoom-independent ramp is tuned against — the overlay is
 * `min(80vw, 90dvh)`, which is 720px on a 800px-tall window. At that size both
 * modes agree, and the UI grows or shrinks from there with the window.
 */
const REFERENCE_PANEL_PX = 720;
const PANEL_VW = 80;
const PANEL_DVH = 90;

export function clampFontSize(value: number): number {
  return clamp(value, MIN_FONT_SIZE, MAX_FONT_SIZE);
}

export function clampUiScale(value: number): number {
  return clamp(value, MIN_UI_SCALE, MAX_UI_SCALE);
}

/**
 * Spacing falls back to 1 rather than to the minimum, because the minimum is 0 —
 * a corrupt stored value should not silently collapse every gap in the UI.
 */
export function clampSpacing(value: number): number {
  return clamp(value, MIN_SPACING, MAX_SPACING, 1);
}

function clamp(value: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/** Trims float noise so the generated CSS stays readable. */
function css(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * The base font size for a surface, as a CSS length.
 *
 * The overlay is laid out inside the page, so its CSS pixels scale with the page
 * zoom level. That single fact decides both modes:
 *
 * - `respectZoom` on — a plain px length. Page zoom scales it along with the rest
 *   of the page, which is what "follow the browser's zoom" means.
 * - `respectZoom` off — a viewport-relative length derived from the overlay's own
 *   `min(80vw, 90dvh)` box. Page zoom shrinks the viewport in CSS px by exactly the
 *   factor it magnifies them, so a `vw`-derived size comes out the same on screen at
 *   every zoom level. It is deliberately free of any `px` term: one would reintroduce
 *   the zoom dependence this mode exists to remove.
 *
 * Neither mode needs to know the zoom factor, so neither has to wait on the
 * background to tell it — the size is right on the first paint.
 *
 * The popup and the options page are browser UI rather than page content, so they
 * are never zoomed and always take the plain px length.
 */
export function resolveBaseFontSize(settings: DisplaySettings, surface: UiSurface): string {
  const fontSize = clampFontSize(settings.fontSize) * (surface === "popup" ? POPUP_FONT_FACTOR : 1);

  if (settings.respectZoom || surface === "popup") {
    return `${css(fontSize)}px`;
  }

  const vw = (PANEL_VW * fontSize) / REFERENCE_PANEL_PX;
  const dvh = (PANEL_DVH * fontSize) / REFERENCE_PANEL_PX;
  return `min(${css(vw)}vw, ${css(dvh)}dvh)`;
}

/**
 * The custom properties that drive the whole size system. Everything else is
 * derived from these two in `shared/ui/styles.css`, under `[data-zen-ui]`.
 */
export function uiScaleStyle(
  settings: DisplaySettings,
  surface: UiSurface,
): Record<string, string> {
  const style: Record<string, string> = {
    "--zen-font-size": resolveBaseFontSize(settings, surface),
    "--zen-scale": css(clampUiScale(settings.uiScale)),
  };
  for (const [key, property] of SPACING_SETTINGS) {
    style[property] = css(clampSpacing(settings[key]));
  }
  return style;
}
