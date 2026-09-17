export const DISPLAY_SETTINGS_STORAGE_KEY = "displaySettings";

export const DISPLAY_THEMES = ["midnight", "ocean", "forest", "rose", "light"] as const;
export type DisplayTheme = (typeof DISPLAY_THEMES)[number];

export interface DisplaySettings {
  filterIssuesInOverlay: boolean;
  groupFolders: boolean;
  groupSubfolders: boolean;
  theme: DisplayTheme;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  filterIssuesInOverlay: true,
  groupFolders: true,
  groupSubfolders: true,
  theme: "midnight",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isDisplayTheme(value: unknown): value is DisplayTheme {
  return typeof value === "string" && DISPLAY_THEMES.includes(value as DisplayTheme);
}

function normalizeDisplaySettings(value: unknown): DisplaySettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }

  const groupFolders =
    typeof value.groupFolders === "boolean"
      ? value.groupFolders
      : DEFAULT_DISPLAY_SETTINGS.groupFolders;
  return {
    filterIssuesInOverlay:
      typeof value.filterIssuesInOverlay === "boolean"
        ? value.filterIssuesInOverlay
        : DEFAULT_DISPLAY_SETTINGS.filterIssuesInOverlay,
    groupFolders,
    groupSubfolders:
      groupFolders && typeof value.groupSubfolders === "boolean"
        ? value.groupSubfolders
        : DEFAULT_DISPLAY_SETTINGS.groupSubfolders && groupFolders,
    theme: isDisplayTheme(value.theme) ? value.theme : DEFAULT_DISPLAY_SETTINGS.theme,
  };
}

export async function readDisplaySettings(): Promise<DisplaySettings> {
  const stored = await browser.storage.local.get(DISPLAY_SETTINGS_STORAGE_KEY);
  return normalizeDisplaySettings(stored[DISPLAY_SETTINGS_STORAGE_KEY]);
}

export async function saveDisplaySettings(settings: DisplaySettings): Promise<DisplaySettings> {
  const normalized = normalizeDisplaySettings(settings);
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
    listener(normalizeDisplaySettings(changes[DISPLAY_SETTINGS_STORAGE_KEY]?.newValue));
  };

  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}
