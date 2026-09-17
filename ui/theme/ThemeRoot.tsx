import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  subscribeToDisplaySettingsChanged,
  type DisplayTheme,
} from "../../lib/display-settings";

export function ThemeRoot({ children }: { children: ComponentChildren }) {
  const [theme, setTheme] = useState<DisplayTheme>(DEFAULT_DISPLAY_SETTINGS.theme);

  useEffect(() => {
    void readDisplaySettings().then((settings) => setTheme(settings.theme));
    return subscribeToDisplaySettingsChanged((settings) => setTheme(settings.theme));
  }, []);

  return (
    <div class="zen-theme bg-zen-bg text-zen-text min-h-full" data-theme={theme}>
      {children}
    </div>
  );
}
