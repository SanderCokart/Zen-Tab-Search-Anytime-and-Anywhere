import * as v from "valibot";
import { DEFAULT_SEARCH_ENGINE, SEARCH_ENGINE_IDS } from "@/features/search/model/web-search";
import {
  clampFontSize,
  clampGap,
  clampGapPaddingRatio,
  clampUiScale,
} from "@/features/settings/model/ui-scale";
import { clampVolume, DEFAULT_SOUND_VOLUME } from "@/shared/ui/sound/engine";
import { THEME_PREFERENCES } from "@/shared/ui/theme";

export const DISPLAY_SETTINGS_STORAGE_KEY = "displaySettings";

export const OPEN_TRANSITIONS = [
  "none",
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "zoom",
] as const;
export type OpenTransition = (typeof OPEN_TRANSITIONS)[number];

/** Labels by the edge the deck comes from. */
export const OPEN_TRANSITION_OPTIONS: readonly { value: OpenTransition; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Bottom" },
  { value: "slide-down", label: "Top" },
  { value: "slide-right", label: "Left" },
  { value: "slide-left", label: "Right" },
  { value: "zoom", label: "Zoom" },
];

/**
 * The default for every preference, and the single source of the fallbacks the
 * schema below uses. Declared before the schema so each field can name its own
 * default rather than repeating the literal.
 */
const DEFAULTS = {
  detectForgeIssues: true,
  /** Overlay only: keep issue tabs in the issue navigator instead of the tab list. */
  filterIssuesInOverlay: true,
  /** Overlay only: keep merge-request and pull-request tabs in the issue navigator. */
  filterRequestsInOverlay: true,
  groupFolders: true,
  groupSubfolders: true,
  /** Leave the spaces grid out of the omnibar, including while searching. */
  hideSpacesInOverlay: false,
  /** Leave essential tabs out of the omnibar, including while searching. */
  hideEssentialsInOverlay: false,
  /** Base font size in px, before the surface and relative-mode adjustments. */
  fontSize: 14,
  /** Density multiplier for padding, gaps, icons and tiles. */
  uiScale: 1,
  truncateTabTitles: true,
  truncateIssueTitles: true,
  /** Gaps, in pixels at the default font size, snapped to 4. */
  sectionGap: 20,
  tabGap: 4,
  folderGap: 12,
  essentialGap: 8,
  spaceGap: 8,
  issueGap: 4,
  todoGap: 4,
  /** How each gap splits into padding on the elements and gap between them; 1 is even. */
  gapPaddingRatio: 1,
  /** Interface sounds: key clicks, latches and chimes. */
  soundEnabled: true,
  /** 0..1, the level the sounds are scaled to. */
  soundVolume: DEFAULT_SOUND_VOLUME,
  /**
   * How solid the omnibar background is, from clear (0) to solid (1).
   * Text and controls stay opaque.
   */
  backgroundOpacity: 0.8,
  /** Focus an already-open tab when another app opens the same address. */
  reuseExternalTabs: false,
  /** Overlay fills the window. Off, it is a centered Spotlight card. */
  fullscreen: false,
  /** Timer row actions, ⏱ labels, header list-swap, Alt+T, browser timer menu. */
  timers: false,
  /** Copy-link row action. */
  copyLink: false,
  /** Right-click menu inside the omnibar. */
  contextMenu: false,
  /** Todo column, row actions, and `@` prefix. Requires fullscreen. */
  todos: false,
  /** Traffic-light status colours on rows. */
  statusColors: false,
  /** MCP / Bridge module on the settings page. */
  mcp: false,
  /** Dedicated GitHub/GitLab tree column. Requires fullscreen. */
  forgeTree: false,
  /** Confirm before creating Zen folders from the Issues and requests column. */
  confirmOrganizeForgeTabs: true,
  /** Host-override header, menus, and proxy UI. */
  hosts: false,
  /** Persistent status bar (MCP link and version). Off, it appears only for an update. */
  statusBar: false,
  /** Engine Shift+Enter uses from the omnibar. */
  searchEngine: DEFAULT_SEARCH_ENGINE,
  /** Light, dark, or whichever the system asks for. */
  theme: "system" as (typeof THEME_PREFERENCES)[number],
  /** How the omnibar comes in. "none" shows it at once. */
  openTransition: "fade" as OpenTransition,
  /** How long that entrance takes, in milliseconds, on 50ms steps. */
  openTransitionMs: 150,
  /** "auto" takes the colour from the theme; a hex value overrides it. */
  accentColor: "auto",
  chassisColor: "auto",
  panelColor: "auto",
  textColor: "auto",
};

export const THEME_COLOR_KEYS = ["accentColor", "chassisColor", "panelColor", "textColor"] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

/** The value of a colour setting that leaves the colour to the theme. */
export const AUTO_COLOR = "auto";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The colours that used to be the defaults, all dark. A stored value equal to
 * one of them was never a choice, and would break the light theme, so it
 * migrates back to "auto".
 */
const LEGACY_DARK_DEFAULTS: Partial<Record<ThemeColorKey, string>> = {
  textColor: "#f5f5f5",
};

/**
 * What each colour looks like while it is left to the theme: the colour picker's
 * swatch shows this, so opening and closing the picker used to save it as a
 * fixed colour. That pinned one theme's colour, and the other theme kept it.
 */
export const AUTO_SWATCH = {
  light: {
    accentColor: "#ff2a1f",
    chassisColor: "#e8e8e5",
    panelColor: "#fafaf8",
    textColor: "#161616",
  },
  dark: {
    accentColor: "#ff2a1f",
    chassisColor: "#121212",
    panelColor: "#1b1b1b",
    textColor: "#ededea",
  },
} as const satisfies Record<"light" | "dark", Record<ThemeColorKey, string>>;

/**
 * Whether a stored colour was never a real choice: an old dark default, or a
 * theme swatch the picker saved by mistake. Both migrate back to "auto".
 */
function isStrayColor(key: ThemeColorKey, value: string): boolean {
  const lower = value.toLowerCase();
  const legacy = LEGACY_DARK_DEFAULTS[key];
  return (
    (legacy !== undefined && lower === legacy) ||
    lower === AUTO_SWATCH.light[key] ||
    lower === AUTO_SWATCH.dark[key]
  );
}

/** The colour to paint with, or undefined to let the theme's own colour show. */
export function customColor(value: string): string | undefined {
  return HEX_COLOR.test(value) ? value : undefined;
}

/** Lowest omnibar-background opacity: 0 is fully transparent, so the page behind shows through. */
export const MIN_BACKGROUND_OPACITY = 0;
/** Fully solid. The stored default is 80%. */
export const MAX_BACKGROUND_OPACITY = 1;

/** Open animation length. 0 shows the deck at once. */
export const MIN_OPEN_TRANSITION_MS = 0;
export const MAX_OPEN_TRANSITION_MS = 1000;
export const OPEN_TRANSITION_MS_STEP = 50;

/** Snaps an open-animation length onto 50ms steps, inside 0..1000. */
export function clampOpenTransitionMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.openTransitionMs;
  const clamped = Math.min(MAX_OPEN_TRANSITION_MS, Math.max(MIN_OPEN_TRANSITION_MS, value));
  return Math.round(clamped / OPEN_TRANSITION_MS_STEP) * OPEN_TRANSITION_MS_STEP;
}

/** Snaps an omnibar background opacity onto the dial's 5% steps, inside 0%..100%. */
export function clampBackgroundOpacity(value: number): number {
  const clamped = Math.min(MAX_BACKGROUND_OPACITY, Math.max(MIN_BACKGROUND_OPACITY, value));
  const steps = Math.round((clamped - MIN_BACKGROUND_OPACITY) / 0.05);
  return Math.round((MIN_BACKGROUND_OPACITY + steps * 0.05) * 100) / 100;
}

/** A stored value that falls back to the default instead of failing the parse. */
function boolean(fallback: boolean) {
  return v.fallback(v.boolean(), fallback);
}

function color(key: ThemeColorKey) {
  return v.fallback(
    v.pipe(
      v.union([v.literal(AUTO_COLOR), v.pipe(v.string(), v.regex(HEX_COLOR))]),
      v.transform((value) => (isStrayColor(key, value) ? AUTO_COLOR : value)),
    ),
    AUTO_COLOR,
  );
}

/**
 * A number held in range by the same helper the options page uses, so a value
 * restored from storage and one just moved on a slider normalise identically.
 * `v.number()` accepts NaN and the infinities, hence the explicit finite check.
 */
function scalar(fallback: number, normalize: (value: number) => number) {
  return v.fallback(
    v.pipe(
      v.number(),
      v.check((value) => Number.isFinite(value)),
      v.transform((value) => normalize(value)),
    ),
    normalize(fallback),
  );
}

/** A gap, snapped to the step. Its own default is what a corrupt value falls back to. */
function gap(fallback: number) {
  return scalar(fallback, (value) => clampGap(value, fallback));
}

/**
 * Display preferences as stored under {@link DISPLAY_SETTINGS_STORAGE_KEY}.
 *
 * Each field falls back on its own, so one unreadable value cannot discard the
 * rest; the outer fallback covers storage holding no object at all. The two
 * dependent options are resolved in a transform over the whole object rather
 * than per field, because their result depends on another field's *normalised*
 * value — reading it off the raw input would get it wrong whenever the parent
 * itself had fallen back.
 */
const displaySettingsSchema = v.pipe(
  v.fallback(
    v.object({
      detectForgeIssues: boolean(DEFAULTS.detectForgeIssues),
      filterIssuesInOverlay: boolean(DEFAULTS.filterIssuesInOverlay),
      filterRequestsInOverlay: boolean(DEFAULTS.filterRequestsInOverlay),
      groupFolders: boolean(DEFAULTS.groupFolders),
      groupSubfolders: boolean(DEFAULTS.groupSubfolders),
      hideSpacesInOverlay: boolean(DEFAULTS.hideSpacesInOverlay),
      hideEssentialsInOverlay: boolean(DEFAULTS.hideEssentialsInOverlay),
      fontSize: scalar(DEFAULTS.fontSize, clampFontSize),
      uiScale: scalar(DEFAULTS.uiScale, clampUiScale),
      truncateTabTitles: boolean(DEFAULTS.truncateTabTitles),
      truncateIssueTitles: boolean(DEFAULTS.truncateIssueTitles),
      sectionGap: gap(DEFAULTS.sectionGap),
      tabGap: gap(DEFAULTS.tabGap),
      folderGap: gap(DEFAULTS.folderGap),
      essentialGap: gap(DEFAULTS.essentialGap),
      spaceGap: gap(DEFAULTS.spaceGap),
      issueGap: gap(DEFAULTS.issueGap),
      todoGap: gap(DEFAULTS.todoGap),
      gapPaddingRatio: scalar(DEFAULTS.gapPaddingRatio, (value) =>
        clampGapPaddingRatio(value, DEFAULTS.gapPaddingRatio),
      ),
      soundEnabled: boolean(DEFAULTS.soundEnabled),
      soundVolume: scalar(DEFAULTS.soundVolume, clampVolume),
      backgroundOpacity: scalar(DEFAULTS.backgroundOpacity, clampBackgroundOpacity),
      reuseExternalTabs: boolean(DEFAULTS.reuseExternalTabs),
      fullscreen: boolean(DEFAULTS.fullscreen),
      timers: boolean(DEFAULTS.timers),
      copyLink: boolean(DEFAULTS.copyLink),
      contextMenu: boolean(DEFAULTS.contextMenu),
      todos: boolean(DEFAULTS.todos),
      statusColors: boolean(DEFAULTS.statusColors),
      mcp: boolean(DEFAULTS.mcp),
      forgeTree: boolean(DEFAULTS.forgeTree),
      confirmOrganizeForgeTabs: boolean(DEFAULTS.confirmOrganizeForgeTabs),
      hosts: boolean(DEFAULTS.hosts),
      statusBar: boolean(DEFAULTS.statusBar),
      searchEngine: v.fallback(v.picklist(SEARCH_ENGINE_IDS), DEFAULTS.searchEngine),
      theme: v.fallback(v.picklist(THEME_PREFERENCES), DEFAULTS.theme),
      openTransition: v.fallback(v.picklist(OPEN_TRANSITIONS), DEFAULTS.openTransition),
      openTransitionMs: scalar(DEFAULTS.openTransitionMs, clampOpenTransitionMs),
      accentColor: color("accentColor"),
      chassisColor: color("chassisColor"),
      panelColor: color("panelColor"),
      textColor: color("textColor"),
    }),
    DEFAULTS,
  ),
  v.transform((settings) => ({
    ...settings,
    filterIssuesInOverlay: settings.detectForgeIssues && settings.filterIssuesInOverlay,
    filterRequestsInOverlay: settings.detectForgeIssues && settings.filterRequestsInOverlay,
    groupSubfolders: settings.groupFolders && settings.groupSubfolders,
  })),
);

export type DisplaySettings = v.InferOutput<typeof displaySettingsSchema>;

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = DEFAULTS;

/** Never throws: every field and the object itself carry a fallback. */
function parseDisplaySettings(value: unknown): DisplaySettings {
  return v.parse(displaySettingsSchema, value);
}

export async function readDisplaySettings(): Promise<DisplaySettings> {
  const stored = await browser.storage.local.get(DISPLAY_SETTINGS_STORAGE_KEY);
  return parseDisplaySettings(stored[DISPLAY_SETTINGS_STORAGE_KEY]);
}

export async function saveDisplaySettings(settings: DisplaySettings): Promise<DisplaySettings> {
  const normalized = parseDisplaySettings(settings);
  await browser.storage.local.set({ [DISPLAY_SETTINGS_STORAGE_KEY]: normalized });
  return normalized;
}

export function subscribeToDisplaySettingsChanged(
  listener: (settings: DisplaySettings) => void,
): () => void {
  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== "local" || !(DISPLAY_SETTINGS_STORAGE_KEY in changes)) {
      return;
    }
    listener(parseDisplaySettings(changes[DISPLAY_SETTINGS_STORAGE_KEY]?.newValue));
  };

  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}
