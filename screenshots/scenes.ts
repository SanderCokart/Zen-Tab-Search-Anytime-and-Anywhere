import {
  DEFAULT_DISPLAY_SETTINGS,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";
import type { OmnibarView } from "@/shared/messaging/protocol";
import type { SearchLayout } from "@/features/search/ui/types";

export type HarnessSurface = "search" | "settings" | "timer" | "hosts";

export interface HarnessScene {
  id: string;
  surface: HarnessSurface;
  layout?: SearchLayout;
  displaySettings?: Partial<DisplaySettings>;
  initialView?: OmnibarView;
}

const SCENES: Record<string, HarnessScene> = {
  "search-omnibar": { id: "search-omnibar", surface: "search", layout: "overlay" },
  "search-popup": { id: "search-popup", surface: "search", layout: "popup" },
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
      textColor: "#e8f1ff",
      issueBackgroundColor: "#1b2838",
      folderBackgroundColor: "#243044",
      spaceBackgroundColor: "#1f2a38",
    },
  },
  "folder-groups": { id: "folder-groups", surface: "search", layout: "overlay" },
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
};

export function sceneFromSearch(search: string): HarnessScene {
  const id = new URLSearchParams(search).get("scene") ?? "search-omnibar";
  return SCENES[id] ?? SCENES["search-omnibar"]!;
}

export function displaySettingsFor(scene: HarnessScene): DisplaySettings {
  return { ...DEFAULT_DISPLAY_SETTINGS, ...scene.displaySettings };
}
