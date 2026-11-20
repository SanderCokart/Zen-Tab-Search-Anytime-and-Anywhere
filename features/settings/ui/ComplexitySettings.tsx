import type { DisplaySettings } from "@/features/settings/model/display-settings";
import {
  applyPreset,
  gridsVisible,
  matchPreset,
  nearestPreset,
  PRESET_IDS,
  PRESET_SLIDER_MAX,
  toggleComplexityFlag,
  toggleGrids,
  type ComplexityFlagKey,
  type ComplexityFlags,
  type ComplexityMatch,
  type ComplexityPresetId,
} from "@/features/settings/model/complexity";
import { Switch } from "@/shared/ui/primitives/Switch";
import { Slider } from "@/shared/ui/primitives/Slider";
import { Module } from "@/shared/ui/primitives/Module";
import { TooltipLegend, useTooltip } from "@/shared/ui/primitives/Tooltip";

const PRESET_LABELS: Record<ComplexityMatch, string> = {
  simple: "Simple",
  enhanced: "Enhanced",
  pro: "Pro",
  dev: "Dev",
  custom: "Custom",
};

const SAFE_TOGGLES: readonly {
  key: ComplexityFlagKey | "grids";
  label: string;
  hint: string;
}[] = [
  {
    key: "grids",
    label: "Spaces and essentials",
    hint: "Shows the spaces and essential-tabs grids above the tab list.",
  },
  { key: "copyLink", label: "Copy link", hint: "Adds a copy-link action on the selected tab." },
  {
    key: "timers",
    label: "Timers",
    hint: "Row actions, countdown labels, and a header button that swaps the list for active timers.",
  },
  {
    key: "reuseExternalTabs",
    label: "Reuse an open tab",
    hint: "Focus an already-open tab when another app opens the same address.",
  },
  {
    key: "groupFolders",
    label: "Folder grouping",
    hint: "Groups tab results by Zen folders.",
  },
  {
    key: "contextMenu",
    label: "Context menu",
    hint: "Right-click a tab in the overlay for rename, move, and the rest.",
  },
  {
    key: "statusColors",
    label: "Status colours",
    hint: "Traffic lights on tab rows.",
  },
  {
    key: "mcp",
    label: "MCP bridge",
    hint: "Shows the MCP module on this page. Connecting still needs a token.",
  },
  {
    key: "statusBar",
    label: "Status bar",
    hint: "Keeps the bottom bar on: MCP link and version. Off, it appears only when an update is available.",
  },
  {
    key: "hosts",
    label: "Host overrides",
    hint: "Header button, menus, and the per-tab proxy UI.",
  },
  {
    key: "fullscreen",
    label: "Fullscreen overlay",
    hint: "Fills the window. Off, the overlay is a centered Spotlight card.",
  },
];

const BLOCKING_TOGGLES: readonly { key: ComplexityFlagKey; label: string; hint: string }[] = [
  {
    key: "todos",
    label: "To-dos",
    hint: "Needs fullscreen. Adds the todo column, row actions, and the @ prefix.",
  },
  {
    key: "forgeTree",
    label: "Issue navigator",
    hint: "Needs fullscreen. The GitHub and GitLab column, with kind chips. ! and # still filter the tab list without this.",
  },
];

function sliderIndex(match: ComplexityMatch, settings: DisplaySettings): number {
  const id = match === "custom" ? nearestPreset(settings) : match;
  return PRESET_IDS.indexOf(id);
}

export function ComplexitySettings({
  settings,
  disabled,
  onChange,
}: {
  settings: DisplaySettings;
  disabled?: boolean;
  onChange: (flags: ComplexityFlags) => void;
}) {
  const match = matchPreset(settings);
  const index = sliderIndex(match, settings);

  return (
    <Module title="Complexity" wide>
      <Slider
        fill
        label="Complexity preset"
        data-testid="zen-complexity-preset"
        min={0}
        max={PRESET_SLIDER_MAX}
        step={1}
        disabled={disabled}
        value={index}
        display={PRESET_LABELS[match].toUpperCase()}
        onChange={(next) => {
          const id = PRESET_IDS[next] as ComplexityPresetId | undefined;
          if (id) onChange(applyPreset(id));
        }}
      />
      <p class="m-0 text-[length:var(--zen-text-sm)] leading-snug text-[var(--zs-ink-3)]">
        Simple, Enhanced, Pro, Dev. Moving the slider overwrites the checkboxes. Ticking a box off
        the preset becomes Custom.
      </p>
      <div class="zs-mod-two">
        {SAFE_TOGGLES.map((item) => {
          if (item.key === "grids") {
            const checked = gridsVisible(settings);
            return (
              <FlagSwitch
                key="grids"
                testId="zen-complexity-grids"
                label={item.label}
                hint={item.hint}
                checked={checked}
                disabled={disabled}
                onChange={(visible) => onChange(toggleGrids(settings, visible))}
              />
            );
          }
          const key = item.key;
          return (
            <FlagSwitch
              key={key}
              testId={`zen-complexity-${key}`}
              label={item.label}
              hint={item.hint}
              checked={settings[key]}
              disabled={disabled}
              onChange={(checked) => onChange(toggleComplexityFlag(settings, key, checked))}
            />
          );
        })}
      </div>
      <p class="m-0 text-[length:var(--zen-text-sm)] leading-snug text-[var(--zs-ink-3)]">
        Needs fullscreen
      </p>
      <div class="zs-mod-two">
        {BLOCKING_TOGGLES.map((item) => (
          <FlagSwitch
            key={item.key}
            testId={`zen-complexity-${item.key}`}
            label={item.label}
            hint={item.hint}
            checked={settings[item.key]}
            disabled={disabled}
            onChange={(checked) => onChange(toggleComplexityFlag(settings, item.key, checked))}
          />
        ))}
      </div>
    </Module>
  );
}

function FlagSwitch({
  testId,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  testId: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const tooltip = useTooltip();
  return (
    <>
      <Switch data-testid={testId} checked={checked} disabled={disabled} onChange={onChange}>
        <span
          class="block font-[family-name:var(--font-title)] leading-tight font-medium"
          onMouseEnter={(event) => tooltip.showAfterPause(event.currentTarget)}
          onMouseLeave={tooltip.hide}
          onFocus={(event) => tooltip.show(event.currentTarget)}
          onBlur={tooltip.hide}
        >
          {label}
        </span>
      </Switch>
      {tooltip.anchor && <TooltipLegend content={hint} anchor={tooltip.anchor} />}
    </>
  );
}
