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
/** Padding to gap: 0 is all gap, 1 splits each gap evenly, 4 is four parts padding to one gap. */
export const MIN_GAP_PADDING_RATIO = 0;
export const MAX_GAP_PADDING_RATIO = 4;
export const GAP_PADDING_RATIO_STEP = 0.25;

/**
 * Gaps are chosen in pixels, but stored as a ratio of this reference size — which
 * is the default `fontSize`. At the default the number on the slider is the gap in
 * pixels exactly; if the font size or the zoom-independent sizing moves, the gap
 * follows the rest of the UI instead of stranding itself at a fixed pixel value.
 */
const GAP_REFERENCE_PX = 14;

/**
 * Every gap in the search UI, in the order the omnibar lays them out, paired with
 * the name of the custom properties it feeds. Each slider sets the space between
 * two neighbours; `gapPaddingRatio` splits it into a real gap
 * (`--zen-<name>-gap-ratio`) and padding on the neighbours themselves
 * (`--zen-<name>-pad-ratio`, per side), so the elements grow into part of it.
 * `shared/ui/styles.css` consumes the properties, the options page renders a
 * slider per entry, and `uiScaleStyle` emits them.
 */
export const GAP_SETTINGS = [
  ["spaceGap", "space"],
  ["essentialGap", "essential"],
  ["tabGap", "tab"],
  ["sectionGap", "section"],
  ["folderGap", "folder"],
  ["issueGap", "issue"],
  ["todoGap", "todo"],
] as const;

export type GapSettingKey = (typeof GAP_SETTINGS)[number][0];

export function clampFontSize(value: number): number {
  return clamp(value, MIN_FONT_SIZE, MAX_FONT_SIZE);
}

/**
 * The font size one wheel notch away: scrolling up (negative `deltaY`) grows it by
 * 1px, scrolling down shrinks it, and the result stays inside the font size range.
 */
export function stepFontSize(current: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return clampFontSize(current);
  }
  return clampFontSize(clampFontSize(current) + (deltaY < 0 ? 1 : -1));
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

/** Snaps the padding-to-gap ratio to its step and holds it within range. */
export function clampGapPaddingRatio(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const snapped = Math.round(value / GAP_PADDING_RATIO_STEP) * GAP_PADDING_RATIO_STEP;
  return Math.min(MAX_GAP_PADDING_RATIO, Math.max(MIN_GAP_PADDING_RATIO, snapped));
}

/**
 * Splits a gap of `total` px by `ratio` (padding : gap) into the gap left between
 * two elements and the padding each element gets on the facing side. The gap plus
 * both paddings is always `total`, so the distance between their contents holds.
 */
export function splitGap(total: number, ratio: number): { gap: number; padding: number } {
  const padShare = ratio / (1 + ratio);
  return { gap: total * (1 - padShare), padding: (total * padShare) / 2 };
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
 * zoom level. It holds the configured size on screen instead: the size is divided
 * by the tab's zoom factor, so the font lands on screen at exactly the configured
 * pixels whatever the zoom and whatever the window size. The factor comes from the
 * background (`tabs.getZoom`), see `usePageZoom`; until it arrives, or for a
 * surface that is not inside a zoomed page, it is 1.
 *
 * The timer and host override windows (`"popup"`) are extension pages in their
 * own resizable windows: they take the plain px length at the full font size,
 * and the window's own zoom scales it like any page.
 */
export function resolveBaseFontSize(
  settings: DisplaySettings,
  surface: UiSurface,
  zoom?: number,
): string {
  const fontSize = clampFontSize(settings.fontSize);

  if (surface === "popup") {
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
  const ratio = clampGapPaddingRatio(settings.gapPaddingRatio);
  for (const [key, name] of GAP_SETTINGS) {
    const { gap, padding } = splitGap(clampGap(settings[key]), ratio);
    style[`--zen-${name}-gap-ratio`] = css(gap / GAP_REFERENCE_PX);
    style[`--zen-${name}-pad-ratio`] = css(padding / GAP_REFERENCE_PX);
  }
  return style;
}
