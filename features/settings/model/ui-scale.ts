import type { DisplaySettings } from "@/features/settings/model/display-settings";

/** The surfaces the search UI is rendered on. */
export type UiSurface = "popup" | "overlay";

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 22;
export const MIN_UI_SCALE = 0.7;
export const MAX_UI_SCALE = 1.5;
export const MIN_GAP = 0;
export const MAX_GAP = 64;
export const GAP_STEP = 4;

/**
 * Gaps are chosen in pixels, but stored as a ratio of this reference size — which
 * is the default `fontSize`. At the default the number on the slider is the gap in
 * pixels exactly; if the font size or the zoom-independent sizing moves, the gap
 * follows the rest of the UI instead of stranding itself at a fixed pixel value.
 */
const GAP_REFERENCE_PX = 14;

/**
 * Every gap in the search UI, paired with the custom property it feeds. Each one
 * maps to exactly one `gap` (or one margin) in one place, so moving a slider has a
 * single visible effect. This list is the only place the setting keys and the CSS
 * properties are tied together — `shared/ui/styles.css` consumes the properties,
 * the options page renders a slider per entry, and `uiScaleStyle` emits them.
 *
 * Padding is deliberately not here: it stays on the density knob, which keeps the
 * two kinds of control from fighting over the same pixels.
 */
export const GAP_SETTINGS = [
  ["sectionGap", "--zen-section-gap-ratio"],
  ["tabGap", "--zen-tab-gap-ratio"],
  ["folderGap", "--zen-folder-gap-ratio"],
  ["essentialGap", "--zen-essential-gap-ratio"],
  ["spaceGap", "--zen-space-gap-ratio"],
  ["issueGap", "--zen-issue-gap-ratio"],
  ["todoGap", "--zen-todo-gap-ratio"],
] as const;

export type GapSettingKey = (typeof GAP_SETTINGS)[number][0];

export function clampFontSize(value: number): number {
  return clamp(value, MIN_FONT_SIZE, MAX_FONT_SIZE);
}

export function clampUiScale(value: number): number {
  return clamp(value, MIN_UI_SCALE, MAX_UI_SCALE);
}

/** Snaps a gap to the nearest {@link GAP_STEP} and holds it within range. */
export function clampGap(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const snapped = Math.round(value / GAP_STEP) * GAP_STEP;
  return Math.min(MAX_GAP, Math.max(MIN_GAP, snapped));
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

/** Zoom levels Firefox allows run from 30% to 500%; anything else is a bad reading. */
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;

/** A usable zoom factor, or 1 (no zoom) for a missing or nonsensical reading. */
export function normalizeZoom(zoom: number | undefined): number {
  if (zoom === undefined || !Number.isFinite(zoom)) {
    return 1;
  }
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

/**
 * The CSS px size that lands on screen at `screenPx` once the page's zoom is applied.
 * A CSS px is `zoom` screen px, so cancelling the zoom means dividing by it.
 */
export function cancelZoom(screenPx: number, zoom: number | undefined): number {
  return screenPx / normalizeZoom(zoom);
}

/**
 * The base font size for a surface, as a CSS length.
 *
 * The overlay is laid out inside the page, so its CSS pixels scale with the page
 * zoom level. That single fact decides both modes:
 *
 * - `respectZoom` on: a plain px length. Page zoom scales it along with the rest
 *   of the page, which is what "follow the browser's zoom" means.
 * - `respectZoom` off: the configured size divided by the tab's zoom factor, so
 *   the font lands on screen at exactly the configured pixels whatever the zoom
 *   and whatever the window size. The factor comes from the background
 *   (`tabs.getZoom`), see `usePageZoom`; until it arrives, or for a surface that
 *   is not inside a zoomed page, it is 1.
 *
 * The timer and host override windows (`"popup"`) are extension pages in their
 * own resizable windows: they take the plain px length at the full font size,
 * and the window's own zoom scales it like any page. The toolbar search popup
 * does not come through here; it pins fixed tokens under `[data-zen-ui="popup"]`.
 */
export function resolveBaseFontSize(
  settings: DisplaySettings,
  surface: UiSurface,
  zoom?: number,
): string {
  const fontSize = clampFontSize(settings.fontSize);

  if (settings.respectZoom || surface === "popup") {
    return `${css(fontSize)}px`;
  }

  return `${css(cancelZoom(fontSize, zoom))}px`;
}

/**
 * The custom properties that drive the whole size system. Everything else is
 * derived from these two in `shared/ui/styles.css`, under `[data-zen-ui]`.
 */
export function uiScaleStyle(
  settings: DisplaySettings,
  surface: UiSurface,
  zoom?: number,
): Record<string, string> {
  const style: Record<string, string> = {
    "--zen-font-size": resolveBaseFontSize(settings, surface, zoom),
    "--zen-scale": css(clampUiScale(settings.uiScale)),
  };
  for (const [key, property] of GAP_SETTINGS) {
    style[property] = css(clampGap(settings[key]) / GAP_REFERENCE_PX);
  }
  return style;
}
