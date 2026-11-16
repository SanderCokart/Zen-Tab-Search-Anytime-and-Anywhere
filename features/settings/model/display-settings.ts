import * as v from "valibot";
import { clampFontSize, clampGap, clampUiScale } from "@/features/settings/model/ui-scale";
import { clampVolume, DEFAULT_SOUND_VOLUME } from "@/shared/ui/sound/engine";
import { THEME_PREFERENCES } from "@/shared/ui/theme";

export const DISPLAY_SETTINGS_STORAGE_KEY = "displaySettings";

/**
 * The default for every preference, and the single source of the fallbacks the
 * schema below uses. Declared before the schema so each field can name its own
 * default rather than repeating the literal.
 */
const DEFAULTS = {
  detectForgeIssues: true,
  filterIssuesInOverlay: true,
  groupFolders: true,
  groupSubfolders: true,
  /** Leave the spaces grid out of that surface. The other surface is unaffected. */
  hideSpacesInPopup: false,
  hideSpacesInOverlay: false,
  /** Leave essential tabs out of that surface, including while searching. */
  hideEssentialsInPopup: false,
  hideEssentialsInOverlay: false,
  /** Base font size in px, before the surface and relative-mode adjustments. */
  fontSize: 14,
  /** Density multiplier for padding, gaps, icons and tiles. */
  uiScale: 1,
  /** Overlay only: follow the page zoom level instead of holding a constant size. */
  respectZoom: false,
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
  /** Interface sounds: key clicks, latches and chimes. */
  soundEnabled: true,
  /** 0..1, the level the sounds are scaled to. */
  soundVolume: DEFAULT_SOUND_VOLUME,
  /** Focus an already-open tab when another app opens the same address. */
  reuseExternalTabs: false,
  /** Light, dark, or whichever the system asks for. */
  theme: "system" as (typeof THEME_PREFERENCES)[number],
  /** "auto" takes the colour from the theme; a hex value overrides it. */
  textColor: "auto",
  issueBackgroundColor: "auto",
  folderBackgroundColor: "auto",
  spaceBackgroundColor: "auto",
};

/** The value of a colour setting that leaves the colour to the theme. */
export const AUTO_COLOR = "auto";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The colours that used to be the defaults, all dark. A stored value equal to
 * one of them was never a choice, and would break the light theme, so it
 * migrates back to "auto".
 */
const LEGACY_DARK_DEFAULTS: Record<string, string> = {
  textColor: "#f5f5f5",
  issueBackgroundColor: "#252525",
  folderBackgroundColor: "#2d2d2d",
  spaceBackgroundColor: "#292929",
};

/**
 * What each colour looks like while it is left to the theme: the colour picker's
 * swatch shows this, so opening and closing the picker used to save it as a
 * fixed colour. That pinned one theme's colour, and the other theme kept it.
 */
export const AUTO_SWATCH = {
  light: {
    textColor: "#161616",
    issueBackgroundColor: "#fafaf8",
    folderBackgroundColor: "#fafaf8",
    spaceBackgroundColor: "#fafaf8",
  },
  dark: {
    textColor: "#ededea",
    issueBackgroundColor: "#1b1b1b",
    folderBackgroundColor: "#1b1b1b",
    spaceBackgroundColor: "#1b1b1b",
  },
} as const satisfies Record<"light" | "dark", Record<string, string>>;

/**
 * Whether a stored colour was never a real choice: an old dark default, or a
 * theme swatch the picker saved by mistake. Both migrate back to "auto".
 */
function isStrayColor(key: keyof typeof LEGACY_DARK_DEFAULTS, value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower === LEGACY_DARK_DEFAULTS[key] ||
    lower === AUTO_SWATCH.light[key as keyof typeof AUTO_SWATCH.light] ||
    lower === AUTO_SWATCH.dark[key as keyof typeof AUTO_SWATCH.dark]
  );
}

/** The colour to paint with, or undefined to let the theme's own colour show. */
export function customColor(value: string): string | undefined {
  return HEX_COLOR.test(value) ? value : undefined;
}

/** A stored value that falls back to the default instead of failing the parse. */
function boolean(fallback: boolean) {
  return v.fallback(v.boolean(), fallback);
}

function color(key: keyof typeof LEGACY_DARK_DEFAULTS) {
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
      groupFolders: boolean(DEFAULTS.groupFolders),
      groupSubfolders: boolean(DEFAULTS.groupSubfolders),
      hideSpacesInPopup: boolean(DEFAULTS.hideSpacesInPopup),
      hideSpacesInOverlay: boolean(DEFAULTS.hideSpacesInOverlay),
      hideEssentialsInPopup: boolean(DEFAULTS.hideEssentialsInPopup),
      hideEssentialsInOverlay: boolean(DEFAULTS.hideEssentialsInOverlay),
      fontSize: scalar(DEFAULTS.fontSize, clampFontSize),
      uiScale: scalar(DEFAULTS.uiScale, clampUiScale),
      respectZoom: boolean(DEFAULTS.respectZoom),
      truncateTabTitles: boolean(DEFAULTS.truncateTabTitles),
      truncateIssueTitles: boolean(DEFAULTS.truncateIssueTitles),
      sectionGap: gap(DEFAULTS.sectionGap),
      tabGap: gap(DEFAULTS.tabGap),
      folderGap: gap(DEFAULTS.folderGap),
      essentialGap: gap(DEFAULTS.essentialGap),
      spaceGap: gap(DEFAULTS.spaceGap),
      issueGap: gap(DEFAULTS.issueGap),
      todoGap: gap(DEFAULTS.todoGap),
      soundEnabled: boolean(DEFAULTS.soundEnabled),
      soundVolume: scalar(DEFAULTS.soundVolume, clampVolume),
      reuseExternalTabs: boolean(DEFAULTS.reuseExternalTabs),
      theme: v.fallback(v.picklist(THEME_PREFERENCES), DEFAULTS.theme),
      textColor: color("textColor"),
      issueBackgroundColor: color("issueBackgroundColor"),
      folderBackgroundColor: color("folderBackgroundColor"),
      spaceBackgroundColor: color("spaceBackgroundColor"),
    }),
    DEFAULTS,
  ),
  v.transform((settings) => ({
    ...settings,
    filterIssuesInOverlay: settings.detectForgeIssues && settings.filterIssuesInOverlay,
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
