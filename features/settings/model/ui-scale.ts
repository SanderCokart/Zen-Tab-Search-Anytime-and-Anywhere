import type { DisplaySettings } from "@/features/settings/model/display-settings";

/** The surfaces the search UI is rendered on. */
export type UiSurface = "popup" | "overlay";

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 22;
export const MIN_UI_SCALE = 0.7;
export const MAX_UI_SCALE = 1.5;

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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
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
  return {
    "--zen-font-size": resolveBaseFontSize(settings, surface),
    "--zen-scale": css(clampUiScale(settings.uiScale)),
  };
}
