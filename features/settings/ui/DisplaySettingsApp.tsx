import { useEffect, useState } from "preact/hooks";
import {
  AUTO_COLOR,
  AUTO_SWATCH,
  customColor,
  DEFAULT_DISPLAY_SETTINGS,
  MAX_BACKGROUND_OPACITY,
  MAX_OPEN_TRANSITION_MS,
  MIN_BACKGROUND_OPACITY,
  MIN_OPEN_TRANSITION_MS,
  OPEN_TRANSITION_MS_STEP,
  readDisplaySettings,
  saveDisplaySettings,
  OPEN_TRANSITION_OPTIONS,
  type DisplaySettings,
  type ThemeColorKey,
} from "@/features/settings/model/display-settings";
import { themeColorStyle } from "@/features/settings/model/theme-colors";
import {
  GAP_PADDING_RATIO_STEP,
  GAP_STEP,
  MAX_FONT_SIZE,
  MAX_GAP,
  MAX_GAP_PADDING_RATIO,
  MAX_UI_SCALE,
  MIN_FONT_SIZE,
  MIN_GAP,
  MIN_GAP_PADDING_RATIO,
  MIN_UI_SCALE,
  type GapSettingKey,
} from "@/features/settings/model/ui-scale";
import { settingsKeyClass } from "@/shared/ui/button-styles";
import { cn } from "@/shared/ui/cn";
import { Dial } from "@/shared/ui/primitives/Dial";
import { Lcd } from "@/shared/ui/primitives/Lcd";
import { FieldText, Module } from "@/shared/ui/primitives/Module";
import { Segmented } from "@/shared/ui/primitives/Segmented";
import { Select } from "@/shared/ui/primitives/Select";
import { Slider } from "@/shared/ui/primitives/Slider";
import { Switch } from "@/shared/ui/primitives/Switch";
import type { SoundVoice } from "@/shared/ui/sound/engine";
import { keyPressVoice } from "@/shared/ui/sound/key-press-voice";
import { SoundProvider, useSoundEngine } from "@/shared/ui/sound/SoundContext";
import { useResolvedTheme, type ThemePreference } from "@/shared/ui/theme";
import { ColorPickerField } from "@/features/settings/ui/ColorPickerField";
import { ComplexitySettings } from "@/features/settings/ui/ComplexitySettings";
import { BridgeSettings } from "@/features/bridge/ui/BridgeSettings";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { TipHint } from "@/shared/ui/primitives/Tooltip";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";

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
    "hideSpacesInOverlay",
    "Hiding Spaces in the Zen Deck",
    "Removes the spaces grid from the Zen Deck. You can still find a space by searching; this does not hide spaces from search results.",
  ],
  [
    "hideEssentialsInOverlay",
    "Hiding Essentials in the Zen Deck",
    "Removes the essentials grid from the Zen Deck. You can still find those tabs by searching; this does not hide them from search results.",
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

/** In the order the omnibar lays them out, top to bottom, then the columns. */
const GAP_CONTROLS: readonly {
  key: GapSettingKey;
  /** The accessible name. */
  label: string;
  /** The short label on the module. */
  scope: string;
  hint: string;
}[] = [
  {
    key: "spaceGap",
    label: "Between spaces",
    scope: "Spaces",
    hint: "Separates the tiles in the spaces grid.",
  },
  {
    key: "essentialGap",
    label: "Between essential tabs",
    scope: "Essentials",
    hint: "Separates the tiles in the essential-tabs grid.",
  },
  {
    key: "tabGap",
    label: "Between tabs",
    scope: "Tabs",
    hint: "Separates one tab row from the next, inside folders as well.",
  },
  {
    key: "sectionGap",
    label: "Between sections",
    scope: "Sections",
    hint: "Separates the spaces block, the essential-tabs block and the tab list from each other.",
  },
  {
    key: "folderGap",
    label: "Between folders",
    scope: "Folders",
    hint: "Separates each folder section from what comes before it.",
  },
  {
    key: "issueGap",
    label: "Between issues and requests",
    scope: "Issues and requests",
    hint: "Separates one entry in the issues and requests column from the next.",
  },
  {
    key: "todoGap",
    label: "Between todos",
    scope: "Todos",
    hint: "Separates one todo-column entry from the next.",
  },
];

/** The ratio as the readout shows it: "1", "0.5", "2.25". */
function formatGapPaddingRatio(ratio: number): string {
  return String(Math.round(ratio * 100) / 100);
}

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
  testId,
}: {
  label: string;
  voice: SoundVoice;
  play: (voice: SoundVoice) => void;
  disabled: boolean;
  red?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      class={cn(settingsKeyClass, red && "zs-key-red !text-white")}
      data-own-sound
      data-testid={testId ?? `zen-sound-test-${label.toLowerCase()}`}
      disabled={disabled}
      onClick={() => play(voice)}
    >
      {label}
    </button>
  );
}

export function DisplaySettingsApp() {
  const [stored, setStored] = useState<DisplaySettings | null>(null);
  useEffect(() => {
    void readDisplaySettings()
      .catch(() => DEFAULT_DISPLAY_SETTINGS)
      .then(setStored);
  }, []);
  // Paint nothing until storage answers. The defaults are not the user's
  // settings, so drawing them first flips switches once the real values land.
  // The blank frame follows the system colour scheme (`color-scheme` on html).
  return stored ? <SettingsPage initial={stored} /> : null;
}

function SettingsPage({ initial }: { initial: DisplaySettings }) {
  const [settings, setSettings] = useState<DisplaySettings>(initial);
  const theme = useResolvedTheme(settings.theme);
  // The page plays its own interface sounds, from the same settings it edits.
  const sound = useSoundEngine({
    enabled: settings.soundEnabled,
    volume: settings.soundVolume,
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        window.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
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

  const soundOff = !settings.soundEnabled;
  const gapsAreDefault =
    settings.gapPaddingRatio === DEFAULT_DISPLAY_SETTINGS.gapPaddingRatio &&
    GAP_CONTROLS.every(({ key }) => settings[key] === DEFAULT_DISPLAY_SETTINGS[key]);
  const sizesAreDefault =
    settings.fontSize === DEFAULT_DISPLAY_SETTINGS.fontSize &&
    settings.uiScale === DEFAULT_DISPLAY_SETTINGS.uiScale;

  return (
    <SoundProvider sound={sound}>
      <main
        class="zs-chassis min-h-screen min-w-0 p-[calc(var(--zen-font-size)*1.7)]"
        data-zen-ui="page"
        data-theme={theme}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{ colorScheme: theme, ...themeColorStyle(theme, settings) }}
      >
        <div class="zs-mod-host mx-auto max-w-[calc(var(--zen-font-size)*60)] min-w-0">
          <header class="px-[var(--zen-space-1)] pb-[calc(var(--zen-font-size)*1.4)]">
            <h1 class="m-0 text-[length:calc(var(--zen-font-size)*2.6)] leading-none font-normal tracking-[-0.02em] uppercase">
              Settings
            </h1>
            <p class="mt-[var(--zen-space-2)] mb-0 text-[length:var(--zen-text-base)] leading-relaxed text-[var(--zs-ink-2)]">
              A module per group. Turn, slide, switch. It saves as you go.
            </p>
          </header>
          <div class="zs-mod-grid">
            <ComplexitySettings settings={settings} onChange={(flags) => updateSettings(flags)} />
            <Module title="Theme" wide>
              <div class="flex flex-wrap items-end justify-between gap-[var(--zen-space-4)]">
                <Segmented
                  class="min-w-[calc(var(--zen-font-size)*20)]"
                  label="Theme"
                  options={THEME_OPTIONS}
                  value={settings.theme}
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
                          <TooltipButton
                            label={`Reset ${label.toLowerCase()}`}
                            tooltip="Reset to default"
                            class="zs-key zs-key-mini flex items-center justify-center text-[var(--zs-ink-2)]"
                            disabled={isDefault}
                            onClick={() => updateSettings({ [key]: DEFAULT_DISPLAY_SETTINGS[key] })}
                          >
                            <ResetIcon class="size-[var(--zen-icon-md)]" />
                          </TooltipButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div class="flex flex-wrap items-start gap-[var(--zen-space-6)]">
                <div class="flex flex-col gap-[var(--zen-space-2)]">
                  <span class={monoLabelClass}>Transition</span>
                  <Select
                    label="Transition"
                    data-testid="zen-open-transition"
                    options={OPEN_TRANSITION_OPTIONS}
                    value={settings.openTransition}
                    onChange={(openTransition) => updateSettings({ openTransition })}
                  />
                </div>
                <div class="flex w-fit flex-col items-center gap-[var(--zen-space-2)] text-center">
                  <Dial
                    label="Open duration"
                    data-testid="zen-open-duration"
                    min={MIN_OPEN_TRANSITION_MS}
                    max={MAX_OPEN_TRANSITION_MS}
                    step={OPEN_TRANSITION_MS_STEP}
                    value={settings.openTransitionMs}
                    valueText={`${settings.openTransitionMs} milliseconds`}
                    onChange={(openTransitionMs) => updateSettings({ openTransitionMs })}
                  />
                  <Lcd class="zs-readout zs-digits">
                    {settings.openTransitionMs}
                    <u>ms</u>
                  </Lcd>
                  <span class={monoLabelClass}>Duration</span>
                </div>
              </div>
              <div class="flex flex-col gap-[var(--zen-space-2)]">
                <span class={monoLabelClass}>Opacity</span>
                <Slider
                  label="Background opacity"
                  data-testid="zen-background-opacity"
                  min={MIN_BACKGROUND_OPACITY}
                  max={MAX_BACKGROUND_OPACITY}
                  step={0.05}
                  value={settings.backgroundOpacity}
                  display={String(Math.round(settings.backgroundOpacity * 100))}
                  unit="%"
                  onChange={(backgroundOpacity) => updateSettings({ backgroundOpacity })}
                />
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
                  value={settings.uiScale}
                  display={String(Math.round(settings.uiScale * 100))}
                  unit="%"
                  onChange={(uiScale) => updateSettings({ uiScale })}
                />
              </div>
              <button
                type="button"
                class={cn(settingsKeyClass, "self-start")}
                disabled={sizesAreDefault}
                onClick={() =>
                  updateSettings({
                    fontSize: DEFAULT_DISPLAY_SETTINGS.fontSize,
                    uiScale: DEFAULT_DISPLAY_SETTINGS.uiScale,
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
                Each one sets the space between one kind of neighbour. The ratio splits that space
                into padding on the elements and the gap left between them.
              </p>
              <div class="flex flex-wrap items-start gap-[var(--zen-space-5)]">
                <div class="zs-mod-two min-w-0 flex-1">
                  {GAP_CONTROLS.map(({ key, label, scope, hint }) => (
                    <TipHint key={key} text={hint}>
                      <div class="flex items-center gap-[var(--zen-space-3)]" key={key}>
                        <span
                          class={cn(monoLabelClass, "w-[calc(var(--zen-font-size)*7)] shrink-0")}
                        >
                          {scope}
                        </span>
                        <Slider
                          class="[--zs-slider-width:calc(var(--zen-font-size)*9.2)]"
                          label={label}
                          data-testid={`zen-${key}`}
                          min={MIN_GAP}
                          max={MAX_GAP}
                          step={GAP_STEP}
                          value={settings[key]}
                          unit="px"
                          onChange={(value) => updateSettings({ [key]: value })}
                        />
                      </div>
                    </TipHint>
                  ))}
                  <div class="flex items-center justify-self-end">
                    <button
                      type="button"
                      class={settingsKeyClass}
                      disabled={gapsAreDefault}
                      onClick={() =>
                        updateSettings({
                          ...Object.fromEntries(
                            GAP_CONTROLS.map(({ key }) => [key, DEFAULT_DISPLAY_SETTINGS[key]]),
                          ),
                          gapPaddingRatio: DEFAULT_DISPLAY_SETTINGS.gapPaddingRatio,
                        })
                      }
                    >
                      <ResetIcon class="size-[var(--zen-icon-sm)]" />
                      Reset gaps
                    </button>
                  </div>
                </div>
                <TipHint text="Padding to gap. Turn it down for more gap, up for more padding; at 1 each gap is split evenly.">
                  <div class="flex w-fit flex-col items-center gap-[var(--zen-space-2)] text-center">
                    <Dial
                      label="Padding to gap ratio"
                      data-testid="zen-gapPaddingRatio"
                      min={MIN_GAP_PADDING_RATIO}
                      max={MAX_GAP_PADDING_RATIO}
                      step={GAP_PADDING_RATIO_STEP}
                      value={settings.gapPaddingRatio}
                      valueText={`${formatGapPaddingRatio(settings.gapPaddingRatio)} to 1`}
                      onChange={(gapPaddingRatio) => updateSettings({ gapPaddingRatio })}
                    />
                    <Lcd class="zs-readout zs-digits">
                      {formatGapPaddingRatio(settings.gapPaddingRatio)}
                      <u>:1</u>
                    </Lcd>
                    <span class={monoLabelClass}>Ratio</span>
                  </div>
                </TipHint>
              </div>
            </Module>

            <Module title="Lists">
              {TRUNCATE_SETTINGS.map(([key, label, hint]) => (
                <Switch
                  key={key}
                  data-testid={`zen-${key}`}
                  checked={settings[key]}
                  onChange={(checked) => updateSettings({ [key]: checked })}
                >
                  <TipHint text={hint}>
                    <FieldText label={label} />
                  </TipHint>
                </Switch>
              ))}
              <Switch
                data-testid="zen-groupFolders"
                checked={settings.groupFolders}
                onChange={(checked) =>
                  updateSettings({
                    groupFolders: checked,
                    groupSubfolders: checked && settings.groupSubfolders,
                  })
                }
              >
                <TipHint text="Shows each folder as a separate section in the tab results.">
                  <FieldText label="Group tabs by folders" />
                </TipHint>
              </Switch>
              <Switch
                class={cn("ml-[var(--zen-space-4)]", !settings.groupFolders && "opacity-50")}
                data-testid="zen-groupSubfolders"
                checked={settings.groupSubfolders}
                disabled={!settings.groupFolders}
                onChange={(checked) => updateSettings({ groupSubfolders: checked })}
              >
                <TipHint text="Adds nested folder sections inside their parent folder.">
                  <FieldText label="Group by subfolders" />
                </TipHint>
              </Switch>
            </Module>

            <Module title="Zen Deck">
              {PINNED_VISIBILITY.map(([key, label, hint]) => (
                <Switch
                  key={key}
                  data-testid={`zen-${key}`}
                  checked={settings[key]}
                  onChange={(checked) => updateSettings({ [key]: checked })}
                >
                  <TipHint text={hint}>
                    <FieldText label={label} />
                  </TipHint>
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
                  onChange={(reuseExternalTabs) => updateSettings({ reuseExternalTabs })}
                >
                  <TipHint text="When another app opens a link in Zen, such as a mail client, focus the tab that already has that address instead of opening a new one.">
                    <span class={monoLabelClass}>Reuse an open tab</span>
                  </TipHint>
                </Switch>
                <Switch
                  data-testid="zen-detectForgeIssues"
                  checked={settings.detectForgeIssues}
                  onChange={(checked) =>
                    updateSettings({
                      detectForgeIssues: checked,
                      filterIssuesInOverlay: checked && settings.filterIssuesInOverlay,
                      filterRequestsInOverlay: checked && settings.filterRequestsInOverlay,
                    })
                  }
                >
                  <TipHint text="Finds issue and pull-request tabs and shows them in the issue navigator.">
                    <span class={monoLabelClass}>Auto-detect GitHub and GitLab issues</span>
                  </TipHint>
                </Switch>
                <Switch
                  class={cn(!settings.detectForgeIssues && "opacity-50")}
                  data-testid="zen-filterIssuesInOverlay"
                  checked={settings.filterIssuesInOverlay}
                  disabled={!settings.detectForgeIssues}
                  onChange={(filterIssuesInOverlay) => updateSettings({ filterIssuesInOverlay })}
                >
                  <TipHint text="Removes issue tabs from the overlay tab results. They remain available in the issue navigator. Needs auto-detect.">
                    <span class={monoLabelClass}>Show issues only in the Issue Navigator</span>
                  </TipHint>
                </Switch>
                <Switch
                  class={cn(!settings.detectForgeIssues && "opacity-50")}
                  data-testid="zen-filterRequestsInOverlay"
                  checked={settings.filterRequestsInOverlay}
                  disabled={!settings.detectForgeIssues}
                  onChange={(filterRequestsInOverlay) =>
                    updateSettings({ filterRequestsInOverlay })
                  }
                >
                  <TipHint text="Removes merge-request and pull-request tabs from the overlay tab results. They remain available in the issue navigator. Needs auto-detect.">
                    <span class={monoLabelClass}>
                      Show merge requests or pull requests only in the Issue Navigator
                    </span>
                  </TipHint>
                </Switch>
                <Switch
                  class={cn(!settings.detectForgeIssues && "opacity-50")}
                  data-testid="zen-confirmOrganizeForgeTabs"
                  checked={settings.confirmOrganizeForgeTabs}
                  disabled={!settings.detectForgeIssues}
                  onChange={(confirmOrganizeForgeTabs) =>
                    updateSettings({ confirmOrganizeForgeTabs })
                  }
                >
                  <TipHint text="Ask before the Issues and requests column creates Zen folders and moves tabs into them. Uncheck, or choose Don't ask this again on that prompt, to skip it.">
                    <span class={monoLabelClass}>Confirm before organizing issue tabs</span>
                  </TipHint>
                </Switch>
              </div>
            </Module>

            {settings.mcp && <BridgeSettings />}

            <Module title="Data" wide>
              <FieldText
                label="Wipe extension data"
                hint="Clears storage and the profile backup. Uninstalling the add-on does not, so onboarding would not run again."
              />
              <WipeExtensionDataButton />
            </Module>

            <Module title="Credits" wide>
              <p class="m-0 text-[length:var(--zen-text-base)] leading-relaxed text-[var(--zs-ink-2)]">
                Zen Deck is a fork of{" "}
                <a
                  class="text-[var(--zs-ink)] underline"
                  href="https://github.com/AntonDobrovinskiy/Zen-Tab-Search"
                >
                  Anton Dobrovinskiy&apos;s Zen Tab Search
                </a>
                , MIT. Look and interface sounds come from{" "}
                <a class="text-[var(--zs-ink)] underline" href="https://github.com/shuding/spec-01">
                  Shu Ding&apos;s SPEC-01
                </a>
                .
              </p>
            </Module>
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

function WipeExtensionDataButton() {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      class="zs-key zs-key-red self-start px-[calc(var(--zen-font-size)*1.4)] py-[var(--zen-space-2)] font-[inherit]"
      data-testid="zen-wipe-data"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        void sendExtensionMessage({ type: "resetExtensionData" }).catch((error) =>
          debugError("Could not wipe extension data:", error),
        );
      }}
    >
      {armed ? "Wipe now — cannot be undone" : "Wipe extension data"}
    </button>
  );
}
