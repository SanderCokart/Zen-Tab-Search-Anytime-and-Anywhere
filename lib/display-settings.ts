export const DISPLAY_SETTINGS_STORAGE_KEY = "displaySettings";

export interface DisplaySettings {
  filterIssuesInOverlay: boolean;
  groupFolders: boolean;
  groupSubfolders: boolean;
  textColor: string;
  issueBackgroundColor: string;
  folderBackgroundColor: string;
  spaceBackgroundColor: string;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  filterIssuesInOverlay: true,
  groupFolders: true,
  groupSubfolders: true,
  textColor: "#f5f5f5",
  issueBackgroundColor: "#252525",
  folderBackgroundColor: "#2d2d2d",
  spaceBackgroundColor: "#292929",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
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
    textColor: isColor(value.textColor) ? value.textColor : DEFAULT_DISPLAY_SETTINGS.textColor,
    issueBackgroundColor: isColor(value.issueBackgroundColor)
      ? value.issueBackgroundColor
      : DEFAULT_DISPLAY_SETTINGS.issueBackgroundColor,
    folderBackgroundColor: isColor(value.folderBackgroundColor)
      ? value.folderBackgroundColor
      : DEFAULT_DISPLAY_SETTINGS.folderBackgroundColor,
    spaceBackgroundColor: isColor(value.spaceBackgroundColor)
      ? value.spaceBackgroundColor
      : DEFAULT_DISPLAY_SETTINGS.spaceBackgroundColor,
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
