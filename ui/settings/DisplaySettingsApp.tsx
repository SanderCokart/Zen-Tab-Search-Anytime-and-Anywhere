import { useEffect, useState } from "preact/hooks";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
} from "../../lib/display-settings";
import { cn } from "../cn";

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
    <main class="bg-zen-bg min-h-screen p-5 text-white">
      <div class="mx-auto flex max-w-xl flex-col gap-4">
        <header>
          <h1 class="m-0 text-xl font-semibold">Display options</h1>
        </header>
        <ul class="m-0 flex list-none flex-col gap-4 p-0" aria-label="Display options">
          <li>
            <label class="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                class="accent-zen-accent mt-1 size-4"
                checked={settings.filterIssuesInOverlay}
                disabled={!loaded}
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
          class="border-zen-border bg-zen-accent hover:bg-zen-accent-hover cursor-pointer self-end rounded-md border px-4 py-2 font-[inherit] text-sm text-white"
          onClick={() => window.close()}
        >
          Done
        </button>
      </div>
    </main>
  );
}
