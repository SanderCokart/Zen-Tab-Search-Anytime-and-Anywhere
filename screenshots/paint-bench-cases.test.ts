import {
  applyPreset,
  COMPLEXITY_FLAG_KEYS,
  pickComplexityFlags,
} from "@/features/settings/model/complexity";
import { describe, expect, it } from "vitest";
import {
  formatPaintBenchReport,
  median,
  paintBenchCases,
  paintBenchSettings,
  type PaintBenchCaseResult,
} from "@/screenshots/paint-bench-cases";

describe("paint bench cases", () => {
  it("starts from simple and flips one complexity flag at a time", () => {
    const cases = paintBenchCases();
    const simple = paintBenchSettings();
    expect(cases[0]).toMatchObject({ id: "simple", kind: "baseline" });
    expect(pickComplexityFlags(cases[0]!.settings)).toEqual(pickComplexityFlags(simple));

    const todos = cases.find((item) => item.id === "todos");
    expect(todos?.label).toBe("todos (fullscreen on)");
    expect(todos?.settings.todos).toBe(true);
    expect(todos?.settings.fullscreen).toBe(true);
    expect(todos?.settings.forgeTree).toBe(false);

    const issueColumn = cases.find((item) => item.id === "forgeTree");
    expect(issueColumn?.settings.forgeTree).toBe(true);
    expect(issueColumn?.settings.fullscreen).toBe(true);
    expect(issueColumn?.settings.todos).toBe(false);

    expect(COMPLEXITY_FLAG_KEYS.every((key) => cases.some((item) => item.id === key))).toBe(true);

    const timers = cases.find((item) => item.id === "timers");
    expect(pickComplexityFlags(timers!.settings)).toEqual({
      ...pickComplexityFlags(simple),
      timers: true,
    });
  });

  it("keeps the presets intact", () => {
    const cases = paintBenchCases();
    expect(pickComplexityFlags(cases.find((item) => item.id === "pro")!.settings)).toEqual(
      applyPreset("pro"),
    );
    expect(pickComplexityFlags(cases.find((item) => item.id === "dev")!.settings)).toEqual(
      applyPreset("dev"),
    );
    expect(
      cases.find((item) => item.id === "forge-detection-off")?.settings.detectForgeIssues,
    ).toBe(false);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
  });

  it("prints deltas against the simple row", () => {
    const rows: PaintBenchCaseResult[] = [
      {
        id: "simple",
        label: "simple",
        kind: "baseline",
        contentMs: 10,
        openMs: 40,
        contentDeltaMs: 0,
        openDeltaMs: 0,
        rows: 8,
        todoRows: 0,
        issueRows: 0,
        statusButtons: 0,
        statusBar: false,
        nodes: 100,
      },
      {
        id: "todos",
        label: "todos (fullscreen on)",
        kind: "isolated",
        contentMs: 18.24,
        openMs: 49.2,
        contentDeltaMs: 8.24,
        openDeltaMs: 9.2,
        rows: 8,
        todoRows: 3,
        issueRows: 0,
        statusButtons: 0,
        statusBar: false,
        nodes: 140,
      },
    ];
    const text = formatPaintBenchReport(rows, 7);
    expect(text).toContain("7 opens");
    expect(text).toContain("browser.sessions is not in these numbers");
    expect(text).toContain("+8.2");
    expect(text).toContain("+9.2");
    expect(median([4, 1, 9])).toBe(4);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
