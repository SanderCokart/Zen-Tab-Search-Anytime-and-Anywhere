import {
  applyPreset,
  constrainComplexityFlags,
  pickComplexityFlags,
  type ComplexityFlagKey,
  type ComplexityFlags,
} from "@/features/settings/model/complexity";
import {
  DEFAULT_DISPLAY_SETTINGS,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";

/**
 * One omnibar open in the screenshot harness.
 * `contentMs` is when the first tab row is committed.
 * `openMs` is the next frame after the overlay leaves its loading stage.
 */
export interface PaintSample {
  contentMs: number;
  openMs: number;
  rows: number;
  todoRows: number;
  issueRows: number;
  statusButtons: number;
  statusBar: boolean;
  nodes: number;
}

export interface PaintBenchCase {
  id: string;
  label: string;
  kind: "baseline" | "isolated" | "preset";
  settings: DisplaySettings;
}

export interface PaintBenchCaseResult {
  id: string;
  label: string;
  kind: PaintBenchCase["kind"];
  contentMs: number;
  openMs: number;
  contentDeltaMs: number;
  openDeltaMs: number;
  rows: number;
  todoRows: number;
  issueRows: number;
  statusButtons: number;
  statusBar: boolean;
  nodes: number;
}

const ISOLATED: readonly { key: ComplexityFlagKey; label: string; value: boolean }[] = [
  { key: "fullscreen", label: "fullscreen", value: true },
  { key: "hideSpacesInOverlay", label: "space grid", value: false },
  { key: "hideEssentialsInOverlay", label: "essentials grid", value: false },
  { key: "copyLink", label: "copy link", value: true },
  { key: "timers", label: "timers", value: true },
  { key: "reuseExternalTabs", label: "reuse external tabs", value: true },
  { key: "groupFolders", label: "folder groups", value: true },
  { key: "contextMenu", label: "context menu", value: true },
  { key: "todos", label: "todos", value: true },
  { key: "statusColors", label: "status colors", value: true },
  { key: "mcp", label: "mcp", value: true },
  { key: "forgeTree", label: "issue column", value: true },
  { key: "hosts", label: "host overrides", value: true },
  { key: "statusBar", label: "status bar", value: true },
];

/** Simple preset, plus any overrides, with the fullscreen rule applied. */
export function paintBenchSettings(overrides: Partial<DisplaySettings> = {}): DisplaySettings {
  const merged: DisplaySettings = {
    ...DEFAULT_DISPLAY_SETTINGS,
    ...applyPreset("simple"),
    ...overrides,
  };
  return { ...merged, ...constrainComplexityFlags(pickComplexityFlags(merged)) };
}

function isolatedLabel(
  key: ComplexityFlagKey,
  label: string,
  simple: ComplexityFlags,
  next: ComplexityFlags,
): string {
  if (key !== "fullscreen" && next.fullscreen && !simple.fullscreen) {
    return `${label} (fullscreen on)`;
  }
  return label;
}

/** Baseline, then each complexity flag flipped on its own, then the named presets. */
export function paintBenchCases(): PaintBenchCase[] {
  const simple = paintBenchSettings();
  const simpleFlags = pickComplexityFlags(simple);
  const isolated = ISOLATED.map((item) => {
    const settings = paintBenchSettings({ [item.key]: item.value });
    return {
      id: item.key,
      label: isolatedLabel(item.key, item.label, simpleFlags, pickComplexityFlags(settings)),
      kind: "isolated" as const,
      settings,
    };
  });

  return [
    { id: "simple", label: "simple", kind: "baseline", settings: simple },
    ...isolated,
    {
      id: "forge-detection-off",
      label: "forge detection off",
      kind: "isolated",
      settings: paintBenchSettings({ detectForgeIssues: false }),
    },
    {
      id: "enhanced",
      label: "preset: enhanced",
      kind: "preset",
      settings: paintBenchSettings(applyPreset("enhanced")),
    },
    {
      id: "pro",
      label: "preset: pro",
      kind: "preset",
      settings: paintBenchSettings(applyPreset("pro")),
    },
    {
      id: "dev",
      label: "preset: dev",
      kind: "preset",
      settings: paintBenchSettings(applyPreset("dev")),
    },
  ];
}

export function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) {
    return 0;
  }
  if (sorted.length % 2 === 1) {
    return upper;
  }
  const lower = sorted[mid - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

function signed(ms: number): string {
  const text = ms.toFixed(1);
  return ms > 0 ? `+${text}` : text;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

/**
 * Plain table. Isolated rows are ordered by how much they add to the simple
 * baseline's content time. Presets stay at the bottom, in slider order.
 */
export function formatPaintBenchReport(cases: PaintBenchCaseResult[], repeats: number): string {
  const baseline = cases.filter((item) => item.kind === "baseline");
  const isolated = cases
    .filter((item) => item.kind === "isolated")
    .sort((left, right) => right.contentDeltaMs - left.contentDeltaMs);
  const presets = cases.filter((item) => item.kind === "preset");
  const rows = [...baseline, ...isolated, ...presets];
  const labelWidth = Math.max(4, ...rows.map((item) => item.label.length));

  const lines = [
    `Omnibar paint, ${repeats} opens each, median. Times are milliseconds.`,
    "content: first tab row committed. open: next frame after the overlay is shown.",
    "Delta is against simple. Fixtures answer at once, so browser.sessions is not in these numbers.",
    "",
    [
      pad("case", labelWidth),
      padStart("content", 8),
      padStart("open", 8),
      padStart("Δcontent", 9),
      padStart("Δopen", 8),
      padStart("rows", 6),
      padStart("todos", 6),
      padStart("issues", 7),
      padStart("nodes", 7),
    ].join(" "),
  ];

  for (const item of rows) {
    lines.push(
      [
        pad(item.label, labelWidth),
        padStart(item.contentMs.toFixed(1), 8),
        padStart(item.openMs.toFixed(1), 8),
        padStart(signed(item.contentDeltaMs), 9),
        padStart(signed(item.openDeltaMs), 8),
        padStart(String(item.rows), 6),
        padStart(String(item.todoRows), 6),
        padStart(String(item.issueRows), 7),
        padStart(String(item.nodes), 7),
      ].join(" "),
    );
  }

  return lines.join("\n");
}
