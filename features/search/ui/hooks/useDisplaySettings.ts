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
}

/** Current display settings, kept in sync with the options page. */
export function useDisplaySettings(): DisplaySettingsState {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [loaded, setLoaded] = useState(false);

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

  return { displaySettings, loaded };
}
