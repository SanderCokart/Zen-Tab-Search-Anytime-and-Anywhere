import { useEffect, useState } from "preact/hooks";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
} from "../../lib/display-settings";
import { cn } from "../cn";
import { ColorPickerField } from "./ColorPickerField";

const COLOR_SETTINGS = [
  ["textColor", "Text color"],
  ["issueBackgroundColor", "Issues background"],
  ["folderBackgroundColor", "Folders background"],
  ["spaceBackgroundColor", "Spaces background"],
] as const;

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
