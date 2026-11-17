import {
  AUTO_SWATCH,
  customColor,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";
import type { ResolvedTheme } from "@/shared/ui/theme";

export type ThemeColorSettings = Pick<
  DisplaySettings,
  "accentColor" | "chassisColor" | "panelColor" | "textColor"
>;

function mix(color: string, percent: number, toward: string): string {
  return `color-mix(in srgb, ${color} ${percent}%, ${toward})`;
}

/**
 * CSS custom properties for a picked palette. Auto keys are omitted so the
 * theme tokens in `styles.css` stay in charge.
 */
export function themeColorStyle(
  theme: ResolvedTheme,
  settings: ThemeColorSettings,
): Record<string, string> {
  const style: Record<string, string> = {};
  const accent = customColor(settings.accentColor);
  const chassis = customColor(settings.chassisColor);
  const panel = customColor(settings.panelColor);
  const text = customColor(settings.textColor);

  if (accent) {
    style["--zs-red"] = accent;
    style["--zs-red-ink"] = mix(accent, 80, theme === "light" ? "black" : "white");
    style["--zs-red-glow"] = mix(accent, 55, "transparent");
  }

  if (chassis) {
    const edge = theme === "light" ? "black" : "white";
    style["--zs-chassis"] = chassis;
    style["--zs-hair"] = mix(chassis, 92, edge);
    style["--zs-line"] = mix(chassis, 82, edge);
  }

  if (panel) {
    style["--zs-card"] = panel;
    if (theme === "light") {
      style["--zs-card-hi"] = mix(panel, 40, "white");
      style["--zs-pressed"] = mix(panel, 90, "black");
      style["--zs-key"] = mix(panel, 96, "black");
      style["--zs-key-edge"] = mix(panel, 82, "black");
    } else {
      style["--zs-card-hi"] = mix(panel, 88, "white");
      style["--zs-pressed"] = mix(panel, 92, "black");
      style["--zs-key"] = mix(panel, 88, "white");
      style["--zs-key-edge"] = mix(panel, 40, "black");
    }
  }

  if (text) {
    const toward = panel ?? AUTO_SWATCH[theme].panelColor;
    style["--zs-ink-1"] = text;
    style["--zs-ink-2"] = mix(text, 70, toward);
    style["--zs-ink-3"] = mix(text, 50, toward);
  }

  return style;
}
