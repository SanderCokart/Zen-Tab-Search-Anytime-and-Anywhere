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

export const PRESETS: Record<ComplexityPresetId, ComplexityFlags> = {
  simple: {
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
  },
  enhanced: {
    fullscreen: false,
    hideSpacesInOverlay: true,
    hideEssentialsInOverlay: true,
    copyLink: true,
    timers: true,
    reuseExternalTabs: true,
    groupFolders: true,
    contextMenu: true,
    todos: false,
    statusColors: false,
    mcp: false,
    forgeTree: false,
    hosts: false,
    statusBar: false,
  },
  pro: {
    fullscreen: true,
    hideSpacesInOverlay: false,
    hideEssentialsInOverlay: false,
    copyLink: true,
    timers: true,
    reuseExternalTabs: true,
    groupFolders: true,
    contextMenu: true,
    todos: true,
    statusColors: true,
    mcp: false,
    forgeTree: false,
    hosts: false,
    statusBar: false,
  },
  dev: {
    fullscreen: true,
    hideSpacesInOverlay: false,
    hideEssentialsInOverlay: false,
    copyLink: true,
    timers: true,
    reuseExternalTabs: true,
    groupFolders: true,
    contextMenu: true,
    todos: true,
    statusColors: true,
    mcp: true,
    forgeTree: true,
    hosts: true,
    statusBar: true,
  },
};

/** Row actions that follow complexity flags. Omitted keys in TabActions stay on. */
export function tabActionFlags(settings: DisplaySettings) {
  return {
    todos: settings.todos,
    copyLink: settings.copyLink,
    timers: settings.timers,
    statusColors: settings.statusColors,
  };
}

export function pickComplexityFlags(settings: DisplaySettings): ComplexityFlags {
  return {
    fullscreen: settings.fullscreen,
    hideSpacesInOverlay: settings.hideSpacesInOverlay,
    hideEssentialsInOverlay: settings.hideEssentialsInOverlay,
    copyLink: settings.copyLink,
    timers: settings.timers,
    reuseExternalTabs: settings.reuseExternalTabs,
    groupFolders: settings.groupFolders,
    contextMenu: settings.contextMenu,
    todos: settings.todos,
    statusColors: settings.statusColors,
    mcp: settings.mcp,
    forgeTree: settings.forgeTree,
    hosts: settings.hosts,
    statusBar: settings.statusBar,
  };
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
