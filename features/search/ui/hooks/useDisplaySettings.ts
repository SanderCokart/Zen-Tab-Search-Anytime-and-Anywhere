import { useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  subscribeToDisplaySettingsChanged,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";

/** Current display settings, kept in sync with the options page. */
export function useDisplaySettings(): DisplaySettings {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);

  useEffect(() => {
    void readDisplaySettings()
      .then(setDisplaySettings)
      .catch((error) => debugError("Could not load display settings:", error));
    return subscribeToDisplaySettingsChanged(setDisplaySettings);
  }, []);

  return displaySettings;
}
