import { useEffect, useState } from "preact/hooks";
import {
  AUTO_COLOR,
  AUTO_SWATCH,
  customColor,
  DEFAULT_DISPLAY_SETTINGS,
  MAX_BACKGROUND_OPACITY,
  MIN_BACKGROUND_OPACITY,
  readDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
  type ThemeColorKey,
} from "@/features/settings/model/display-settings";
import { themeColorStyle } from "@/features/settings/model/theme-colors";
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
import { settingsKeyClass } from "@/shared/ui/button-styles";
import { cn } from "@/shared/ui/cn";
import { Dial } from "@/shared/ui/primitives/Dial";
import { Lcd } from "@/shared/ui/primitives/Lcd";
import { FieldText, Module } from "@/shared/ui/primitives/Module";
import { Segmented } from "@/shared/ui/primitives/Segmented";
import { Slider } from "@/shared/ui/primitives/Slider";
import { Switch } from "@/shared/ui/primitives/Switch";
import type { SoundVoice } from "@/shared/ui/sound/engine";
import { keyPressVoice } from "@/shared/ui/sound/key-press-voice";
import { SoundProvider, useSoundEngine } from "@/shared/ui/sound/SoundContext";
import { useResolvedTheme, type ThemePreference } from "@/shared/ui/theme";
import { ColorPickerField } from "@/features/settings/ui/ColorPickerField";
import { BridgeSettings } from "@/features/bridge/ui/BridgeSettings";

const COLOR_SETTINGS: readonly [ThemeColorKey, string, string][] = [
  ["accentColor", "Accent color", "Accent"],
  ["chassisColor", "Frame color", "Frame"],
  ["panelColor", "Panels color", "Panels"],
  ["textColor", "Text color", "Text"],
];

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const PINNED_VISIBILITY = [
  [
    "hideSpacesInPopup",
    "Hide spaces in the toolbar popup",
    "Leaves the spaces grid out of the toolbar popup until you search. The omnibar is unchanged.",
  ],
  [
    "hideSpacesInOverlay",
    "Hide spaces in the omnibar",
    "Leaves the spaces grid out of the in-page search until you search. The toolbar popup is unchanged.",
  ],
  [
    "hideEssentialsInPopup",
    "Hide essential tabs in the toolbar popup",
    "Leaves essential tabs out of the toolbar popup until you search. The omnibar is unchanged.",
  ],
  [
    "hideEssentialsInOverlay",
    "Hide essential tabs in the omnibar",
    "Leaves essential tabs out of the in-page search until you search. The toolbar popup is unchanged.",
  ],
] as const;

const TRUNCATE_SETTINGS = [
  [
    "truncateTabTitles",
    "Truncate tab titles",
    "Cuts each tab and space title to one line. Off, long titles wrap onto as many lines as they need.",
  ],
  [
    "truncateIssueTitles",
    "Truncate issue titles",
    "Cuts each title in the issue navigator to one line. Off, long titles wrap onto as many lines as they need.",
  ],
] as const;

/** Setting key, full label (the accessible name), the short label on the module, hint. */
const GAP_CONTROLS: readonly (readonly [GapSettingKey, string, string, string])[] = [
  [
    "tabGap",
    "Between tabs",
    "Tabs",
    "Separates one tab row from the next, inside folders as well.",
  ],
  [
    "folderGap",
    "Between folders",
    "Folders",
    "Separates each folder section from what comes before it.",
  ],
  [
    "essentialGap",
    "Between essential tabs",
    "Essentials",
    "Separates the tiles in the essential-tabs grid.",
  ],
  ["spaceGap", "Between spaces", "Spaces", "Separates the tiles in the spaces grid."],
  [
    "sectionGap",
    "Between sections",
    "Sections",
    "Separates the spaces block, the essential-tabs block and the tab list from each other.",
  ],
  ["issueGap", "Between issues", "Issues", "Separates one issue-navigator entry from the next."],
  ["todoGap", "Between todos", "Todos", "Separates one todo-column entry from the next."],
];

const monoLabelClass = "zs-label !font-normal !text-[var(--zs-ink-3)]";

function ResetIcon({ class: className }: { class?: string }) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

/** A test key for the Sound module: it plays its own voice, so the press listener skips it. */
function TestKey({
  label,
  voice,
  play,
  disabled,
  red = false,
}: {
  label: string;
  voice: SoundVoice;
  play: (voice: SoundVoice) => void;
  disabled: boolean;
  red?: boolean;
}) {
  return (
    <button
      type="button"
      class={cn(settingsKeyClass, red && "zs-key-red !text-white")}
      data-own-sound
      data-testid={`zen-sound-test-${label.toLowerCase()}`}
      disabled={disabled}
      onClick={() => play(voice)}
    >
      {label}
    </button>
  );
}

export function DisplaySettingsApp() {
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const theme = useResolvedTheme(settings.theme);
  // The page plays its own interface sounds, from the same settings it edits.
  const sound = useSoundEngine({
    enabled: settings.soundEnabled,
    volume: settings.soundVolume,
  });

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

  // Hardware keys are heard going down and up, from one listener for the page.
  const onPointerDown = (event: PointerEvent) => {
    const voice = keyPressVoice(event.target, false);
    if (voice) sound.play(voice);
  };
  const onPointerUp = (event: PointerEvent) => {
    const voice = keyPressVoice(event.target, true);
    if (voice) sound.play(voice);
  };

  const soundOff = !loaded || !settings.soundEnabled;
  const gapsAreDefault = GAP_CONTROLS.every(
    ([key]) => settings[key] === DEFAULT_DISPLAY_SETTINGS[key],
  );
  const sizesAreDefault =
    settings.fontSize === DEFAULT_DISPLAY_SETTINGS.fontSize &&
    settings.uiScale === DEFAULT_DISPLAY_SETTINGS.uiScale &&
    settings.respectZoom === DEFAULT_DISPLAY_SETTINGS.respectZoom;

  return (
    <SoundProvider sound={sound}>
      <main
        class="zs-chassis min-h-screen p-[calc(var(--zen-font-size)*1.7)]"
        data-zen-ui="page"
        data-theme={theme}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{ colorScheme: theme, ...themeColorStyle(theme, settings) }}
      >
        <div class="zs-mod-host mx-auto max-w-[calc(var(--zen-font-size)*60)]">
          <header class="px-[var(--zen-space-1)] pb-[calc(var(--zen-font-size)*1.4)]">
            <h1 class="m-0 text-[length:calc(var(--zen-font-size)*2.6)] leading-none font-normal tracking-[-0.02em] uppercase">
              Settings
            </h1>
            <p class="mt-[var(--zen-space-2)] mb-0 text-[length:var(--zen-text-base)] leading-relaxed text-[var(--zs-ink-2)]">
              A module per group. Turn, slide, switch. It saves as you go.
            </p>
          </header>
          <div class="zs-mod-grid">
            <Module title="Theme" wide>
              <div class="flex flex-wrap items-end justify-between gap-[var(--zen-space-4)]">
                <Segmented
                  class="min-w-[calc(var(--zen-font-size)*20)]"
                  label="Theme"
                  options={THEME_OPTIONS}
                  value={settings.theme}
                  disabled={!loaded}
                  onChange={(next) => updateSettings({ theme: next })}
                />
                <div class="flex flex-wrap gap-[var(--zen-space-3)]" data-testid="zen-theme-colors">
                  {COLOR_SETTINGS.map(([key, label, short]) => {
                    const isDefault = settings[key] === AUTO_COLOR;
                    return (
                      <div class="flex flex-col gap-[var(--zen-space-1)]" key={key}>
                        <span class={monoLabelClass}>{short}</span>
                        <div class="flex items-center gap-[var(--zen-space-1)]">
                          <ColorPickerField
                            disabled={!loaded}
                            label={label}
                            caption={isDefault ? "AUTO" : settings[key].toUpperCase()}
                            color={customColor(settings[key]) ?? AUTO_SWATCH[theme][key]}
                            onChange={(color) => {
                              // Landing on the theme's own colour is no choice:
                              // keep it auto, so the other theme still gets its own.
                              const isSwatch =
                                color.toLowerCase() === AUTO_SWATCH.light[key] ||
                                color.toLowerCase() === AUTO_SWATCH.dark[key];
                              if (isDefault && isSwatch) return;
                              updateSettings({ [key]: isSwatch ? AUTO_COLOR : color });
                            }}
                          />
                          <button
                            type="button"
                            class="zs-key zs-key-mini flex items-center justify-center text-[var(--zs-ink-2)]"
                            disabled={!loaded || isDefault}
                            aria-label={`Reset ${label.toLowerCase()}`}
                            title="Reset to default"
                            onClick={() => updateSettings({ [key]: DEFAULT_DISPLAY_SETTINGS[key] })}
                          >
                            <ResetIcon class="size-[var(--zen-icon-md)]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div class="flex w-fit flex-col items-center gap-[var(--zen-space-2)] text-center">
                <Dial
                  label="Background opacity"
                  data-testid="zen-background-opacity"
                  min={MIN_BACKGROUND_OPACITY}
                  max={MAX_BACKGROUND_OPACITY}
                  step={0.05}
                  disabled={!loaded}
                  value={settings.backgroundOpacity}
                  valueText={`${Math.round(settings.backgroundOpacity * 100)} percent`}
                  onChange={(backgroundOpacity) => updateSettings({ backgroundOpacity })}
                />
                <Lcd class="zs-readout zs-digits">
                  {Math.round(settings.backgroundOpacity * 100)}
                  <u>%</u>
                </Lcd>
                <span class={monoLabelClass}>Opacity</span>
              </div>
            </Module>

            <Module title="Size">
              <div class="flex flex-col gap-[var(--zen-space-2)]">
                <FieldText
                  label="Font size"
                  hint="The base text size everything else is derived from."
                />
                <Slider
                  label="Font size"
                  data-testid="zen-fontSize"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  step={1}
                  disabled={!loaded}
                  value={settings.fontSize}
                  unit="px"
                  onChange={(fontSize) => updateSettings({ fontSize })}
                />
              </div>
              <div class="flex flex-col gap-[var(--zen-space-2)]">
                <FieldText
                  label="Density"
                  hint="Padding, gaps, icons and the space and essential-tab tiles."
                />
                <Slider
                  label="Density"
                  data-testid="zen-uiScale"
                  min={MIN_UI_SCALE}
                  max={MAX_UI_SCALE}
                  step={0.05}
                  disabled={!loaded}
                  value={settings.uiScale}
                  display={String(Math.round(settings.uiScale * 100))}
                  unit="%"
                  onChange={(uiScale) => updateSettings({ uiScale })}
                />
              </div>
              <Switch
                data-testid="zen-respect-zoom"
                checked={settings.respectZoom}
                disabled={!loaded}
                onChange={(respectZoom) => updateSettings({ respectZoom })}
              >
                <span title="Lets the overlay grow and shrink with the browser's zoom, like the page underneath it. Off, the overlay keeps the same size on screen at every zoom level.">
                  <FieldText
                    label="Follow the page zoom level"
                    hint="The overlay grows and shrinks with the browser zoom. Off, it keeps one size on screen."
                  />
                </span>
              </Switch>
              <button
                type="button"
                class={cn(settingsKeyClass, "self-start")}
                disabled={!loaded || sizesAreDefault}
                onClick={() =>
                  updateSettings({
                    fontSize: DEFAULT_DISPLAY_SETTINGS.fontSize,
                    uiScale: DEFAULT_DISPLAY_SETTINGS.uiScale,
                    respectZoom: DEFAULT_DISPLAY_SETTINGS.respectZoom,
                  })
                }
              >
                <ResetIcon class="size-[var(--zen-icon-sm)]" />
                Reset sizes
              </button>
            </Module>

            <Module title="Sound">
              <div class="flex items-center justify-around gap-[var(--zen-space-4)]">
                <div class="flex flex-col items-center gap-[var(--zen-space-2)] text-center">
                  <Dial
                    label="Volume"
                    data-testid="zen-sound-volume"
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={soundOff}
                    value={settings.soundVolume}
                    valueText={`${Math.round(settings.soundVolume * 100)} percent`}
                    onChange={(soundVolume) => updateSettings({ soundVolume })}
                  />
                  <Lcd class="zs-readout zs-digits">
                    {Math.round(settings.soundVolume * 100)}
                    <u>%</u>
                  </Lcd>
                  <span class={monoLabelClass}>Volume</span>
                </div>
                <Switch
                  class="min-w-0 flex-1 flex-col items-start"
                  data-testid="zen-sound-enabled"
                  showState
                  checked={settings.soundEnabled}
                  disabled={!loaded}
                  onChange={(soundEnabled) => updateSettings({ soundEnabled })}
                >
                  <FieldText
                    label="Interface sounds"
                    hint="Key clicks, latches and chimes while you search, set todos and timers."
                  />
                </Switch>
              </div>
              <div class="flex flex-wrap items-center gap-[var(--zen-space-2)]">
                <span class={cn(monoLabelClass, "mr-[var(--zen-space-2)]")}>Test</span>
                <TestKey label="Click" voice="down" play={sound.play} disabled={soundOff} />
                <TestKey label="Tick" voice="tick" play={sound.play} disabled={soundOff} />
                <TestKey label="Chime" voice="success" play={sound.play} disabled={soundOff} red />
              </div>
            </Module>

            <Module title="Gaps" wide>
              <p class="m-0 font-[family-name:var(--font-title)] text-[length:var(--zen-text-sm)] text-[var(--zs-ink-3)]">
                Each one moves a single gap and nothing else; padding inside rows and tiles follows
                Density.
              </p>
              <div class="zs-mod-two">
                {GAP_CONTROLS.map(([key, label, short, hint]) => (
                  <div class="flex items-center gap-[var(--zen-space-3)]" key={key} title={hint}>
                    <span class={cn(monoLabelClass, "w-[calc(var(--zen-font-size)*7)] shrink-0")}>
                      {short}
                    </span>
                    <Slider
                      class="[--zs-slider-width:calc(var(--zen-font-size)*9.2)]"
                      label={label}
                      data-testid={`zen-${key}`}
                      min={MIN_GAP}
                      max={MAX_GAP}
                      step={GAP_STEP}
                      disabled={!loaded}
                      value={settings[key]}
                      unit="px"
                      onChange={(value) => updateSettings({ [key]: value })}
                    />
                  </div>
                ))}
                <div class="flex items-center justify-self-end">
                  <button
                    type="button"
                    class={settingsKeyClass}
                    disabled={!loaded || gapsAreDefault}
                    onClick={() =>
                      updateSettings(
                        Object.fromEntries(
                          GAP_CONTROLS.map(([key]) => [key, DEFAULT_DISPLAY_SETTINGS[key]]),
                        ),
                      )
                    }
                  >
                    <ResetIcon class="size-[var(--zen-icon-sm)]" />
                    Reset gaps
                  </button>
                </div>
              </div>
            </Module>

            <Module title="Lists">
              {TRUNCATE_SETTINGS.map(([key, label, hint]) => (
                <Switch
                  key={key}
                  data-testid={`zen-${key}`}
                  checked={settings[key]}
                  disabled={!loaded}
                  onChange={(checked) => updateSettings({ [key]: checked })}
                >
                  <span title={hint}>
                    <FieldText label={label} />
                  </span>
                </Switch>
              ))}
              <Switch
                data-testid="zen-groupFolders"
                checked={settings.groupFolders}
                disabled={!loaded}
                onChange={(checked) =>
                  updateSettings({
                    groupFolders: checked,
                    groupSubfolders: checked && settings.groupSubfolders,
                  })
                }
              >
                <span title="Shows each folder as a separate section in the tab results.">
                  <FieldText label="Group tabs by folders" />
                </span>
              </Switch>
              <Switch
                class={cn("ml-[var(--zen-space-4)]", !settings.groupFolders && "opacity-50")}
                data-testid="zen-groupSubfolders"
                checked={settings.groupSubfolders}
                disabled={!loaded || !settings.groupFolders}
                onChange={(checked) => updateSettings({ groupSubfolders: checked })}
              >
                <span title="Adds nested folder sections inside their parent folder.">
                  <FieldText label="Group by subfolders" />
                </span>
              </Switch>
            </Module>

            <Module title="Popup & omnibar">
              {PINNED_VISIBILITY.map(([key, label, hint]) => (
                <Switch
                  key={key}
                  data-testid={`zen-${key}`}
                  checked={settings[key]}
                  disabled={!loaded}
                  onChange={(checked) => updateSettings({ [key]: checked })}
                >
                  <span title={hint}>
                    <FieldText label={label} />
                  </span>
                </Switch>
              ))}
            </Module>

            <Module title="Links & issues" wide>
              {/* A two-column grid of short mono labels and switches, like Gaps;
                  the full explanations are tooltips. */}
              <div class="zs-mod-two">
                <Switch
                  data-testid="zen-reuseExternalTabs"
                  checked={settings.reuseExternalTabs}
                  disabled={!loaded}
                  onChange={(reuseExternalTabs) => updateSettings({ reuseExternalTabs })}
                >
                  <span
                    class={monoLabelClass}
                    title="When another app opens a link in Zen, such as a mail client, focus the tab that already has that address instead of opening a new one."
                  >
                    Reuse an open tab
                  </span>
                </Switch>
                <Switch
                  data-testid="zen-detectForgeIssues"
                  checked={settings.detectForgeIssues}
                  disabled={!loaded}
                  onChange={(checked) =>
                    updateSettings({
                      detectForgeIssues: checked,
                      filterIssuesInOverlay: checked && settings.filterIssuesInOverlay,
                      filterRequestsInOverlay: checked && settings.filterRequestsInOverlay,
                    })
                  }
                >
                  <span
                    class={monoLabelClass}
                    title="Finds issue and pull-request tabs and shows them in the issue navigator."
                  >
                    Auto-detect GitHub and GitLab issues
                  </span>
                </Switch>
                <Switch
                  class={cn(!settings.detectForgeIssues && "opacity-50")}
                  data-testid="zen-filterIssuesInOverlay"
                  checked={settings.filterIssuesInOverlay}
                  disabled={!loaded || !settings.detectForgeIssues}
                  onChange={(filterIssuesInOverlay) => updateSettings({ filterIssuesInOverlay })}
                >
                  <span
                    class={monoLabelClass}
                    title="Removes issue tabs from the overlay tab results. They remain available in the issue navigator. Needs auto-detect."
                  >
                    Show issues only in the Issue Navigator
                  </span>
                </Switch>
                <Switch
                  class={cn(!settings.detectForgeIssues && "opacity-50")}
                  data-testid="zen-filterRequestsInOverlay"
                  checked={settings.filterRequestsInOverlay}
                  disabled={!loaded || !settings.detectForgeIssues}
                  onChange={(filterRequestsInOverlay) =>
                    updateSettings({ filterRequestsInOverlay })
                  }
                >
                  <span
                    class={monoLabelClass}
                    title="Removes merge-request and pull-request tabs from the overlay tab results. They remain available in the issue navigator. Needs auto-detect."
                  >
                    Show merge requests or pull requests only in the Issue Navigator
                  </span>
                </Switch>
              </div>
            </Module>

            <BridgeSettings />
          </div>
          <div class="mt-[var(--zen-space-4)] flex justify-end">
            <button
              type="button"
              class="zs-key zs-key-red px-[calc(var(--zen-font-size)*1.4)] py-[var(--zen-space-2)] font-[inherit]"
              onClick={() => window.close()}
            >
              Done
            </button>
          </div>
        </div>
      </main>
    </SoundProvider>
  );
}
