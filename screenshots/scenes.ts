import {
  clampOpenTransitionMs,
  DEFAULT_DISPLAY_SETTINGS,
  OPEN_TRANSITIONS,
  type DisplaySettings,
  type OpenTransition,
} from "@/features/settings/model/display-settings";
import { applyPreset } from "@/features/settings/model/complexity";
import type { OmnibarView } from "@/shared/messaging/protocol";
import type { SearchLayout } from "@/features/search/ui/types";

export type HarnessSurface = "search" | "settings" | "timer" | "hosts";

export interface HarnessScene {
  id: string;
  surface: HarnessSurface;
  layout?: SearchLayout;
  displaySettings?: Partial<DisplaySettings>;
  initialView?: OmnibarView;
  /** Answer the update check with a newer release than the installed one. */
  updateAvailable?: boolean;
}

/**
 * Spotlight-shaped concept comps. The overlay is still edge-to-edge in product
 * CSS; the harness constrains `[data-omnibar]` for these ids only.
 */
export const SPOTLIGHT_CONCEPT_SCENES = [
  "concept-simple",
  "concept-simple-forge",
  "concept-enhanced",
  "concept-enhanced-timers",
] as const;

const CONCEPT_SIMPLE = applyPreset("simple");
const CONCEPT_ENHANCED = applyPreset("enhanced");

const SCENES: Record<string, HarnessScene> = {
  "search-omnibar": { id: "search-omnibar", surface: "search", layout: "overlay" },
  "search-popup": { id: "search-popup", surface: "search", layout: "popup" },
  "update-available": {
    id: "update-available",
    surface: "search",
    layout: "overlay",
    updateAvailable: true,
  },
  "omnibar-shape": { id: "omnibar-shape", surface: "search", layout: "overlay" },
  "hide-spaces-and-essentials": {
    id: "hide-spaces-and-essentials",
    surface: "search",
    layout: "overlay",
    displaySettings: {
      hideSpacesInOverlay: true,
      hideEssentialsInOverlay: true,
    },
  },
  "display-truncation": {
    id: "display-truncation",
    surface: "search",
    layout: "overlay",
    displaySettings: {
      truncateTabTitles: false,
      truncateIssueTitles: false,
    },
  },
  "spacing-size-and-zoom": {
    id: "spacing-size-and-zoom",
    surface: "search",
    layout: "overlay",
    displaySettings: {
      fontSize: 16,
      uiScale: 1.2,
      folderGap: 20,
      sectionGap: 12,
    },
  },
  "display-colors": {
    id: "display-colors",
    surface: "search",
    layout: "overlay",
    displaySettings: {
      theme: "dark",
      accentColor: "#e0943a",
      chassisColor: "#161311",
      panelColor: "#221c19",
    },
  },
  "custom-colors-settings": {
    id: "custom-colors-settings",
    surface: "settings",
    displaySettings: {
      theme: "dark",
      accentColor: "#e0943a",
      chassisColor: "#161311",
      panelColor: "#221c19",
    },
  },
  "folder-groups": { id: "folder-groups", surface: "search", layout: "overlay" },
  // Wide gaps so the ratio's split between gap and padding is easy to see.
  "gap-ratio-gap": {
    id: "gap-ratio-gap",
    surface: "search",
    layout: "overlay",
    displaySettings: { gapPaddingRatio: 0, tabGap: 12, issueGap: 12, todoGap: 12 },
  },
  "gap-ratio-padding": {
    id: "gap-ratio-padding",
    surface: "search",
    layout: "overlay",
    displaySettings: { gapPaddingRatio: 4, tabGap: 12, issueGap: 12, todoGap: 12 },
  },
  // Forge tabs stay in the list here, so the current PR sits in its collapsed folder.
  "collapsed-folders": {
    id: "collapsed-folders",
    surface: "search",
    layout: "overlay",
    displaySettings: {
      filterIssuesInOverlay: false,
      filterRequestsInOverlay: false,
    },
  },
  "timers-from-search": {
    id: "timers-from-search",
    surface: "search",
    layout: "overlay",
    initialView: { kind: "timers" },
  },
  "timer-form": {
    id: "timer-form",
    surface: "search",
    layout: "overlay",
    initialView: { kind: "timer", tabId: 1 },
  },
  "host-overrides": {
    id: "host-overrides",
    surface: "search",
    layout: "overlay",
    initialView: { kind: "hosts", tabId: 9 },
  },
  "display-settings": { id: "display-settings", surface: "settings" },
  "timer-popup": { id: "timer-popup", surface: "timer" },
  "host-popup": { id: "host-popup", surface: "hosts" },
  "concept-simple": {
    id: "concept-simple",
    surface: "search",
    layout: "overlay",
    displaySettings: CONCEPT_SIMPLE,
  },
  "concept-simple-forge": {
    id: "concept-simple-forge",
    surface: "search",
    layout: "overlay",
    displaySettings: CONCEPT_SIMPLE,
  },
  "concept-enhanced": {
    id: "concept-enhanced",
    surface: "search",
    layout: "overlay",
    displaySettings: CONCEPT_ENHANCED,
  },
  "concept-enhanced-timers": {
    id: "concept-enhanced-timers",
    surface: "search",
    layout: "overlay",
    displaySettings: CONCEPT_ENHANCED,
    initialView: { kind: "timers" },
  },
  "concept-pro": {
    id: "concept-pro",
    surface: "search",
    layout: "overlay",
    displaySettings: applyPreset("pro"),
  },
  "concept-dev": { id: "concept-dev", surface: "search", layout: "overlay" },
};

export function sceneFromSearch(search: string): HarnessScene {
  const id = new URLSearchParams(search).get("scene") ?? "search-omnibar";
  return SCENES[id] ?? SCENES["search-omnibar"]!;
}

function isOpenTransition(value: string | null): value is OpenTransition {
  return value !== null && (OPEN_TRANSITIONS as readonly string[]).includes(value);
}

/** `?transition=zoom&ms=500` overrides the scene so GIF flows can pick a motion. */
export function displaySettingsFor(scene: HarnessScene, search = ""): DisplaySettings {
  const spotlight = (SPOTLIGHT_CONCEPT_SCENES as readonly string[]).includes(scene.id);
  const params = new URLSearchParams(search);
  const transition = params.get("transition");
  const msRaw = params.get("ms");
  return {
    ...DEFAULT_DISPLAY_SETTINGS,
    ...(spotlight ? applyPreset("simple") : applyPreset("dev")),
    ...scene.displaySettings,
    ...(isOpenTransition(transition) ? { openTransition: transition } : {}),
    ...(msRaw !== null && msRaw !== ""
      ? { openTransitionMs: clampOpenTransitionMs(Number(msRaw)) }
      : {}),
  };
}
