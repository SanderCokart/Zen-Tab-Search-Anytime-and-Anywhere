import type { DisplaySettings } from "@/features/settings/model/display-settings";

/** Set once the first-run complexity card has been dismissed. */
export const COMPLEXITY_SETUP_DONE_KEY = "complexitySetupDone";

export const PRESET_IDS = ["simple", "enhanced", "pro", "dev"] as const;
/** Last stop on the complexity slider; Custom is not a position. */
export const PRESET_SLIDER_MAX = PRESET_IDS.length - 1;
export type ComplexityPresetId = (typeof PRESET_IDS)[number];
export type ComplexityMatch = ComplexityPresetId | "custom";

/**
 * Every flag the presets overwrite. Cosmetic sliders (font, theme, gaps) stay
 * put when the user moves the complexity slider.
 */
export const COMPLEXITY_FLAG_KEYS = [
  "fullscreen",
  "hideSpacesInOverlay",
  "hideEssentialsInOverlay",
  "copyLink",
  "timers",
  "reuseExternalTabs",
  "groupFolders",
  "contextMenu",
  "todos",
  "statusColors",
  "mcp",
  "forgeTree",
  "hosts",
  "statusBar",
] as const;

export type ComplexityFlagKey = (typeof COMPLEXITY_FLAG_KEYS)[number];
export type ComplexityFlags = Pick<DisplaySettings, ComplexityFlagKey>;

/** Features that need a second overlay column, so they cannot sit in Spotlight. */
export const FULLSCREEN_REQUIRED = [
  "todos",
  "forgeTree",
] as const satisfies readonly ComplexityFlagKey[];

const SIMPLE_FLAGS: ComplexityFlags = {
  fullscreen: false,
  hideSpacesInOverlay: true,
  hideEssentialsInOverlay: true,
  copyLink: false,
  timers: false,
  reuseExternalTabs: false,
  groupFolders: false,
  contextMenu: false,
  todos: false,
  statusColors: false,
  mcp: false,
  forgeTree: false,
  hosts: false,
  statusBar: false,
};

const ENHANCED_FLAGS: ComplexityFlags = {
  ...SIMPLE_FLAGS,
  copyLink: true,
  timers: true,
  reuseExternalTabs: true,
  groupFolders: true,
  contextMenu: true,
};

const PRO_FLAGS: ComplexityFlags = {
  ...ENHANCED_FLAGS,
  fullscreen: true,
  hideSpacesInOverlay: false,
  hideEssentialsInOverlay: false,
  todos: true,
  statusColors: true,
};

export const PRESETS: Record<ComplexityPresetId, ComplexityFlags> = {
  simple: SIMPLE_FLAGS,
  enhanced: ENHANCED_FLAGS,
  pro: PRO_FLAGS,
  dev: { ...PRO_FLAGS, mcp: true, forgeTree: true, hosts: true, statusBar: true },
};

/** Row actions that follow complexity flags. */
export type TabActionFlags = Pick<
  DisplaySettings,
  "todos" | "copyLink" | "timers" | "statusColors" | "hosts"
>;

export function tabActionFlags(settings: DisplaySettings): TabActionFlags {
  return {
    todos: settings.todos,
    copyLink: settings.copyLink,
    timers: settings.timers,
    statusColors: settings.statusColors,
    hosts: settings.hosts,
  };
}

export function pickComplexityFlags(settings: DisplaySettings): ComplexityFlags {
  return Object.fromEntries(
    COMPLEXITY_FLAG_KEYS.map((key) => [key, settings[key]]),
  ) as ComplexityFlags;
}

/**
 * Repair a flag set so blocking features always sit on fullscreen.
 * Turning fullscreen off is {@link toggleComplexityFlag}, not this — a stored
 * `todos: true` with `fullscreen: false` is treated as "enable the column".
 */
export function constrainComplexityFlags(flags: ComplexityFlags): ComplexityFlags {
  if (!flags.todos && !flags.forgeTree) {
    return flags;
  }
  return { ...flags, fullscreen: true };
}

export function applyPreset(id: ComplexityPresetId): ComplexityFlags {
  return { ...PRESETS[id] };
}

export function matchPreset(settings: DisplaySettings): ComplexityMatch {
  const flags = pickComplexityFlags(settings);
  for (const id of PRESET_IDS) {
    const preset = PRESETS[id];
    if (COMPLEXITY_FLAG_KEYS.every((key) => flags[key] === preset[key])) {
      return id;
    }
  }
  return "custom";
}

/** Named stop the slider sits on when the checkboxes have left the presets. */
export function nearestPreset(settings: DisplaySettings): ComplexityPresetId {
  const flags = pickComplexityFlags(settings);
  let best: ComplexityPresetId = "simple";
  let bestScore = Number.POSITIVE_INFINITY;
  for (const id of PRESET_IDS) {
    const preset = PRESETS[id];
    let score = 0;
    for (const key of COMPLEXITY_FLAG_KEYS) {
      if (flags[key] !== preset[key]) score += 1;
    }
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

export function toggleComplexityFlag(
  settings: DisplaySettings,
  key: ComplexityFlagKey,
  value: boolean,
): ComplexityFlags {
  const next = { ...pickComplexityFlags(settings), [key]: value };
  if (key === "fullscreen" && !value) {
    next.todos = false;
    next.forgeTree = false;
    return next;
  }
  return constrainComplexityFlags(next);
}

/** Spaces and essentials grids are one checkbox in the complexity UI. */
export function toggleGrids(settings: DisplaySettings, visible: boolean): ComplexityFlags {
  return constrainComplexityFlags({
    ...pickComplexityFlags(settings),
    hideSpacesInOverlay: !visible,
    hideEssentialsInOverlay: !visible,
  });
}

export function gridsVisible(
  settings: Pick<ComplexityFlags, "hideSpacesInOverlay" | "hideEssentialsInOverlay">,
): boolean {
  return !settings.hideSpacesInOverlay && !settings.hideEssentialsInOverlay;
}
