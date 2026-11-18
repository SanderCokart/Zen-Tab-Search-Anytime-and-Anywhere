import { useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  subscribeToDisplaySettingsChanged,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";

export interface DisplaySettingsState {
  displaySettings: DisplaySettings;
  /** True after the first storage read, even if it fell back to defaults. */
  loaded: boolean;
  /** Apply a change before storage echoes it back. */
  setDisplaySettings: (settings: DisplaySettings) => void;
}

/** Holds the last read settings across remounts, so a reopened search skips the wait. */
export interface DisplaySettingsCache {
  displaySettings?: DisplaySettings;
}

/**
 * Current display settings, kept in sync with the options page. With a cache
 * holding earlier settings, it starts from those, already loaded, and re-reads.
 */
export function useDisplaySettings(cache?: DisplaySettingsCache): DisplaySettingsState {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(
    () => cache?.displaySettings ?? DEFAULT_DISPLAY_SETTINGS,
  );
  const [loaded, setLoaded] = useState(cache?.displaySettings !== undefined);

  useEffect(() => {
    if (cache && loaded) cache.displaySettings = displaySettings;
  }, [cache, loaded, displaySettings]);

  useEffect(() => {
    void readDisplaySettings()
      .then((settings) => {
        setDisplaySettings(settings);
        setLoaded(true);
      })
      .catch((error) => {
        debugError("Could not load display settings:", error);
        setLoaded(true);
      });
    return subscribeToDisplaySettingsChanged(setDisplaySettings);
  }, []);

  return { displaySettings, loaded, setDisplaySettings };
}
