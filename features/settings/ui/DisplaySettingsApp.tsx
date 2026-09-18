import { useEffect, useState } from "preact/hooks";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";
import {
  GAP_STEP,
  MAX_FONT_SIZE,
  MAX_GAP,
  MAX_UI_SCALE,
  MIN_FONT_SIZE,
  MIN_GAP,
  MIN_UI_SCALE,
  type GapSettingKey,
} from "@/features/settings/model/ui-scale";
import { cn } from "@/shared/ui/cn";
import { ColorPickerField } from "@/features/settings/ui/ColorPickerField";

const COLOR_SETTINGS = [
  ["textColor", "Text color"],
  ["issueBackgroundColor", "Issues background"],
  ["folderBackgroundColor", "Folders background"],
  ["spaceBackgroundColor", "Spaces background"],
] as const;

const TRUNCATE_SETTINGS = [
  [
    "truncateTabTitles",
    "Tab titles",
    "Cuts each tab and space title to one line. Off, long titles wrap onto as many lines as they need.",
  ],
  [
    "truncateIssueTitles",
    "Issue titles",
    "Cuts each title in the issue navigator to one line. Off, long titles wrap onto as many lines as they need.",
  ],
] as const;

const GAP_CONTROLS: readonly (readonly [GapSettingKey, string, string])[] = [
  ["tabGap", "Between tabs", "Separates one tab row from the next, inside folders as well."],
  ["folderGap", "Between folders", "Separates each folder section from what comes before it."],
  ["essentialGap", "Between essential tabs", "Separates the tiles in the essential-tabs grid."],
  ["spaceGap", "Between spaces", "Separates the tiles in the spaces grid."],
  [
    "sectionGap",
    "Between sections",
    "Separates the spaces block, the essential-tabs block and the tab list from each other.",
  ],
  ["issueGap", "Between issues", "Separates one issue-navigator entry from the next."],
];

const rangeClass =
  "accent-zen-accent h-1 w-40 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

function ResetIcon({ class: className }: { class?: string }) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function DisplaySettingsApp() {
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void readDisplaySettings()
      .then((stored) => {
        setSettings(stored);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        window.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const updateSettings = (changes: Partial<DisplaySettings>) => {
    const next = {
      ...settings,
      ...changes,
    };
    setSettings(next);
    void saveDisplaySettings(next);
  };

  return (
    <main class="bg-zen-bg min-h-screen p-5" style={{ color: settings.textColor }}>
      <div class="mx-auto flex max-w-xl flex-col gap-4">
        <header>
          <h1 class="m-0 text-xl font-semibold">Display options</h1>
        </header>
        <fieldset class="border-zen-line m-0 flex flex-col gap-3 rounded-md border p-3">
          <legend class="px-1 text-sm font-medium">Colors</legend>
          {COLOR_SETTINGS.map(([key, label]) => {
            const isDefault = settings[key].toLowerCase() === DEFAULT_DISPLAY_SETTINGS[key];
            return (
              <div class="flex items-center justify-between gap-4 text-sm" key={key}>
                <span>{label}</span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-inherit hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!loaded || isDefault}
                    aria-label={`Reset ${label.toLowerCase()}`}
                    title="Reset to default"
                    onClick={() => updateSettings({ [key]: DEFAULT_DISPLAY_SETTINGS[key] })}
                  >
                    <ResetIcon class="size-4" />
                  </button>
                  <ColorPickerField
                    disabled={!loaded}
                    label={label}
                    color={settings[key]}
                    onChange={(color) => updateSettings({ [key]: color })}
                  />
                </div>
              </div>
            );
          })}
        </fieldset>
        <fieldset class="border-zen-line m-0 flex flex-col gap-3 rounded-md border p-3">
          <legend class="px-1 text-sm font-medium">Size</legend>
          <label class="flex items-center justify-between gap-4 text-sm">
            <span>
              <span class="block font-medium">Font size</span>
              <span class="text-zen-subtle block text-xs">
                The base text size everything else is derived from.
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              <input
                type="range"
                class={rangeClass}
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={1}
                disabled={!loaded}
                value={settings.fontSize}
                onInput={(event) => updateSettings({ fontSize: Number(event.currentTarget.value) })}
              />
              <span class="w-12 text-right tabular-nums">{settings.fontSize}px</span>
            </span>
          </label>
          <label class="flex items-center justify-between gap-4 text-sm">
            <span>
              <span class="block font-medium">Density</span>
              <span class="text-zen-subtle block text-xs">
                Padding, gaps, icons and the space and essential-tab tiles.
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              <input
                type="range"
                class={rangeClass}
                min={MIN_UI_SCALE}
                max={MAX_UI_SCALE}
                step={0.05}
                disabled={!loaded}
                value={settings.uiScale}
                onInput={(event) => updateSettings({ uiScale: Number(event.currentTarget.value) })}
              />
              <span class="w-12 text-right tabular-nums">
                {Math.round(settings.uiScale * 100)}%
              </span>
            </span>
          </label>
          <label class="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              class="accent-zen-accent mt-1 size-4"
              data-testid="zen-respect-zoom"
              checked={settings.respectZoom}
              disabled={!loaded}
              onChange={(event) => updateSettings({ respectZoom: event.currentTarget.checked })}
            />
            <span>
              <span class="block text-sm font-medium">Follow the page zoom level</span>
              <span class="text-zen-subtle block text-xs">
                Lets the overlay grow and shrink with the browser's zoom, like the page underneath
                it. Off, the overlay keeps the same size on screen at every zoom level.
              </span>
            </span>
          </label>
          <button
            type="button"
            class="border-zen-clear text-zen-faint hover:bg-zen-surface cursor-pointer self-start rounded-md border bg-transparent px-2 py-1 font-[inherit] text-xs disabled:cursor-not-allowed disabled:opacity-40"
            disabled={
              !loaded ||
              (settings.fontSize === DEFAULT_DISPLAY_SETTINGS.fontSize &&
                settings.uiScale === DEFAULT_DISPLAY_SETTINGS.uiScale &&
                settings.respectZoom === DEFAULT_DISPLAY_SETTINGS.respectZoom)
            }
            onClick={() =>
              updateSettings({
                fontSize: DEFAULT_DISPLAY_SETTINGS.fontSize,
                uiScale: DEFAULT_DISPLAY_SETTINGS.uiScale,
                respectZoom: DEFAULT_DISPLAY_SETTINGS.respectZoom,
              })
            }
          >
            Reset sizes
          </button>
        </fieldset>
        <fieldset class="border-zen-line m-0 flex flex-col gap-3 rounded-md border p-3">
          <legend class="px-1 text-sm font-medium">Gaps</legend>
          <p class="text-zen-subtle m-0 text-xs">
            Pixels at the default font size, in steps of {GAP_STEP}. Each one moves a single gap and
            nothing else; padding inside rows and tiles follows the density slider above.
          </p>
          {GAP_CONTROLS.map(([key, label, hint]) => (
            <label class="flex items-center justify-between gap-4 text-sm" key={key}>
              <span>
                <span class="block font-medium">{label}</span>
                <span class="text-zen-subtle block text-xs">{hint}</span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <input
                  type="range"
                  class={rangeClass}
                  data-testid={`zen-${key}`}
                  min={MIN_GAP}
                  max={MAX_GAP}
                  step={GAP_STEP}
                  disabled={!loaded}
                  value={settings[key]}
                  onInput={(event) => updateSettings({ [key]: Number(event.currentTarget.value) })}
                />
                <span class="w-12 text-right tabular-nums">{settings[key]}px</span>
              </span>
            </label>
          ))}
          <button
            type="button"
            class="border-zen-clear text-zen-faint hover:bg-zen-surface cursor-pointer self-start rounded-md border bg-transparent px-2 py-1 font-[inherit] text-xs disabled:cursor-not-allowed disabled:opacity-40"
            disabled={
              !loaded ||
              GAP_CONTROLS.every(([key]) => settings[key] === DEFAULT_DISPLAY_SETTINGS[key])
            }
            onClick={() =>
              updateSettings(
                Object.fromEntries(
                  GAP_CONTROLS.map(([key]) => [key, DEFAULT_DISPLAY_SETTINGS[key]]),
                ),
              )
            }
          >
            Reset gaps
          </button>
        </fieldset>
        <fieldset class="border-zen-line m-0 flex flex-col gap-3 rounded-md border p-3">
          <legend class="px-1 text-sm font-medium">Truncate</legend>
          {TRUNCATE_SETTINGS.map(([key, label, hint]) => (
            <label class="flex cursor-pointer items-start gap-3" key={key}>
              <input
                type="checkbox"
                class="accent-zen-accent mt-1 size-4"
                data-testid={`zen-${key}`}
                checked={settings[key]}
                disabled={!loaded}
                onChange={(event) => updateSettings({ [key]: event.currentTarget.checked })}
              />
              <span>
                <span class="block text-sm font-medium">{label}</span>
                <span class="text-zen-subtle block text-xs">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <ul class="m-0 flex list-none flex-col gap-4 p-0" aria-label="Display options">
          <li>
            <label class="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                class="accent-zen-accent mt-1 size-4"
                checked={settings.detectForgeIssues}
                disabled={!loaded}
                onChange={(event) =>
                  updateSettings({
                    detectForgeIssues: event.currentTarget.checked,
                    filterIssuesInOverlay:
                      event.currentTarget.checked && settings.filterIssuesInOverlay,
                  })
                }
              />
              <span>
                <span class="block text-sm font-medium">Auto-detect GitHub and GitLab issues</span>
                <span class="text-zen-subtle block text-xs">
                  Finds issue and pull-request tabs and shows them in the issue navigator.
                </span>
              </span>
            </label>
            <ul class="border-zen-border mt-3 ml-7 list-none border-l pl-4">
              <li>
                <label
                  class={cn(
                    "flex items-start gap-3",
                    settings.detectForgeIssues ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    class="accent-zen-accent mt-1 size-4"
                    checked={settings.filterIssuesInOverlay}
                    disabled={!loaded || !settings.detectForgeIssues}
                    onChange={(event) =>
                      updateSettings({ filterIssuesInOverlay: event.currentTarget.checked })
                    }
                  />
                  <span>
                    <span class="block text-sm font-medium">
                      Show issues only in the issue navigator
                    </span>
                    <span class="text-zen-subtle block text-xs">
                      Removes issue and pull-request tabs from the overlay tab results. They remain
                      available in the issue navigator.
                    </span>
                  </span>
                </label>
              </li>
            </ul>
          </li>
          <li>
            <label class="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                class="accent-zen-accent mt-1 size-4"
                checked={settings.groupFolders}
                disabled={!loaded}
                onChange={(event) =>
                  updateSettings({
                    groupFolders: event.currentTarget.checked,
                    groupSubfolders: event.currentTarget.checked && settings.groupSubfolders,
                  })
                }
              />
              <span>
                <span class="block text-sm font-medium">Group tabs by folders</span>
                <span class="text-zen-subtle block text-xs">
                  Shows each folder as a separate section in the tab results.
                </span>
              </span>
            </label>
            <ul class="border-zen-border mt-3 ml-7 list-none border-l pl-4">
              <li>
                <label
                  class={cn(
                    "flex items-start gap-3",
                    settings.groupFolders ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    class="accent-zen-accent mt-1 size-4"
                    checked={settings.groupSubfolders}
                    disabled={!loaded || !settings.groupFolders}
                    onChange={(event) =>
                      updateSettings({ groupSubfolders: event.currentTarget.checked })
                    }
                  />
                  <span>
                    <span class="block text-sm font-medium">Group by subfolders</span>
                    <span class="text-zen-subtle block text-xs">
                      Adds nested folder sections inside their parent folder.
                    </span>
                  </span>
                </label>
              </li>
            </ul>
          </li>
        </ul>
        <button
          type="button"
          class="border-zen-border bg-zen-accent hover:bg-zen-accent-hover cursor-pointer self-end rounded-md border px-4 py-2 font-[inherit] text-sm"
          onClick={() => window.close()}
        >
          Done
        </button>
      </div>
    </main>
  );
}
