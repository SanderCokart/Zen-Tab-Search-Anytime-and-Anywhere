import { clampFontSize, clampSpacing, clampUiScale } from "@/features/settings/model/ui-scale";

export const DISPLAY_SETTINGS_STORAGE_KEY = "displaySettings";

export interface DisplaySettings {
  detectForgeIssues: boolean;
  filterIssuesInOverlay: boolean;
  groupFolders: boolean;
  groupSubfolders: boolean;
  /** Base font size in px, before the surface and relative-mode adjustments. */
  fontSize: number;
  /** Density multiplier for padding, gaps, icons and tiles. */
  uiScale: number;
  /** Overlay only: follow the page zoom level instead of holding a constant size. */
  respectZoom: boolean;
  /** Cut tab titles to one line instead of wrapping them. */
  truncateTabTitles: boolean;
  /** Cut issue and pull-request titles to one line instead of wrapping them. */
  truncateIssueTitles: boolean;
  /**
   * Per-element spacing multipliers, applied on top of the density-derived
   * spacing. 1 leaves it as `uiScale` set it; 0 removes it entirely.
   */
  tabGap: number;
  tabPadding: number;
  tileGap: number;
  tilePadding: number;
  issueGap: number;
  issuePadding: number;
  textColor: string;
  issueBackgroundColor: string;
  folderBackgroundColor: string;
  spaceBackgroundColor: string;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  detectForgeIssues: true,
  filterIssuesInOverlay: true,
  groupFolders: true,
  groupSubfolders: true,
  fontSize: 16,
  uiScale: 1,
  respectZoom: false,
  truncateTabTitles: true,
  truncateIssueTitles: true,
  tabGap: 1,
  tabPadding: 1,
  tileGap: 1,
  tilePadding: 1,
  issueGap: 1,
  issuePadding: 1,
  textColor: "#f5f5f5",
  issueBackgroundColor: "#252525",
  folderBackgroundColor: "#2d2d2d",
  spaceBackgroundColor: "#292929",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function spacing(value: unknown, fallback: number): number {
  return clampSpacing(isNumber(value) ? value : fallback);
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeDisplaySettings(value: unknown): DisplaySettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }

  const detectForgeIssues =
    typeof value.detectForgeIssues === "boolean"
      ? value.detectForgeIssues
      : DEFAULT_DISPLAY_SETTINGS.detectForgeIssues;
  const groupFolders =
    typeof value.groupFolders === "boolean"
      ? value.groupFolders
      : DEFAULT_DISPLAY_SETTINGS.groupFolders;
  return {
    detectForgeIssues,
    filterIssuesInOverlay:
      detectForgeIssues && typeof value.filterIssuesInOverlay === "boolean"
        ? value.filterIssuesInOverlay
        : DEFAULT_DISPLAY_SETTINGS.filterIssuesInOverlay && detectForgeIssues,
    groupFolders,
    groupSubfolders:
      groupFolders && typeof value.groupSubfolders === "boolean"
        ? value.groupSubfolders
        : DEFAULT_DISPLAY_SETTINGS.groupSubfolders && groupFolders,
    fontSize: clampFontSize(
      isNumber(value.fontSize) ? value.fontSize : DEFAULT_DISPLAY_SETTINGS.fontSize,
    ),
    uiScale: clampUiScale(
      isNumber(value.uiScale) ? value.uiScale : DEFAULT_DISPLAY_SETTINGS.uiScale,
    ),
    respectZoom:
      typeof value.respectZoom === "boolean"
        ? value.respectZoom
        : DEFAULT_DISPLAY_SETTINGS.respectZoom,
    truncateTabTitles:
      typeof value.truncateTabTitles === "boolean"
        ? value.truncateTabTitles
        : DEFAULT_DISPLAY_SETTINGS.truncateTabTitles,
    truncateIssueTitles:
      typeof value.truncateIssueTitles === "boolean"
        ? value.truncateIssueTitles
        : DEFAULT_DISPLAY_SETTINGS.truncateIssueTitles,
    tabGap: spacing(value.tabGap, DEFAULT_DISPLAY_SETTINGS.tabGap),
    tabPadding: spacing(value.tabPadding, DEFAULT_DISPLAY_SETTINGS.tabPadding),
    tileGap: spacing(value.tileGap, DEFAULT_DISPLAY_SETTINGS.tileGap),
    tilePadding: spacing(value.tilePadding, DEFAULT_DISPLAY_SETTINGS.tilePadding),
    issueGap: spacing(value.issueGap, DEFAULT_DISPLAY_SETTINGS.issueGap),
    issuePadding: spacing(value.issuePadding, DEFAULT_DISPLAY_SETTINGS.issuePadding),
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
