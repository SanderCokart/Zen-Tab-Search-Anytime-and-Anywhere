import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import {
  applyPreset,
  constrainComplexityFlags,
  FULLSCREEN_REQUIRED,
  gridsVisible,
  matchPreset,
  nearestPreset,
  PRESET_IDS,
  PRESET_SLIDER_MAX,
  PRESETS,
  toggleComplexityFlag,
  toggleGrids,
} from "@/features/settings/model/complexity";

describe("complexity presets", () => {
  it("maps each named tier to a complete flag set", () => {
    expect(PRESET_IDS).toEqual(["simple", "enhanced", "pro", "dev"]);
    expect(PRESETS.simple.fullscreen).toBe(false);
    expect(PRESETS.simple.timers).toBe(false);
    expect(PRESETS.simple.todos).toBe(false);
    expect(PRESETS.enhanced.fullscreen).toBe(false);
    expect(PRESETS.enhanced.hideSpacesInOverlay).toBe(true);
    expect(PRESETS.enhanced.hideEssentialsInOverlay).toBe(true);
    expect(PRESETS.enhanced.timers).toBe(true);
    expect(PRESETS.enhanced.reuseExternalTabs).toBe(true);
    expect(PRESETS.enhanced.groupFolders).toBe(true);
    expect(PRESETS.enhanced.contextMenu).toBe(true);
    expect(PRESETS.pro.fullscreen).toBe(true);
    expect(PRESETS.pro.todos).toBe(true);
    expect(PRESETS.pro.mcp).toBe(false);
    expect(PRESETS.pro.forgeTree).toBe(false);
    expect(PRESETS.dev.forgeTree).toBe(true);
    expect(PRESETS.dev.hosts).toBe(true);
    expect(PRESETS.simple.statusBar).toBe(false);
    expect(PRESETS.enhanced.statusBar).toBe(false);
    expect(PRESETS.pro.statusBar).toBe(false);
    expect(PRESETS.dev.statusBar).toBe(true);
    expect(PRESET_SLIDER_MAX).toBe(3);
  });

  it("places a custom flag set on the nearest named stop, not past Dev", () => {
    const almostDev = { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("dev"), mcp: false };
    expect(matchPreset(almostDev)).toBe("custom");
    expect(nearestPreset(almostDev)).toBe("dev");
    expect(nearestPreset({ ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") })).toBe("simple");
  });

  it("returns simple through dev from matchPreset, and custom after a checkbox", () => {
    expect(matchPreset({ ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") })).toBe("simple");
    expect(matchPreset({ ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("enhanced") })).toBe(
      "enhanced",
    );
    expect(matchPreset({ ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("pro") })).toBe("pro");
    expect(matchPreset({ ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("dev") })).toBe("dev");

    const withTimers = {
      ...DEFAULT_DISPLAY_SETTINGS,
      ...applyPreset("simple"),
      timers: true,
    };
    expect(matchPreset(withTimers)).toBe("custom");
  });

  it("treats todos and the forge tree as fullscreen-required", () => {
    expect([...FULLSCREEN_REQUIRED]).toEqual(["todos", "forgeTree"]);
    const fromSimpleTodos = toggleComplexityFlag(
      { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") },
      "todos",
      true,
    );
    expect(fromSimpleTodos.todos).toBe(true);
    expect(fromSimpleTodos.fullscreen).toBe(true);

    const spotlight = toggleComplexityFlag(
      { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("pro") },
      "fullscreen",
      false,
    );
    expect(spotlight.fullscreen).toBe(false);
    expect(spotlight.todos).toBe(false);
    expect(spotlight.forgeTree).toBe(false);

    expect(constrainComplexityFlags({ ...applyPreset("simple"), todos: true }).fullscreen).toBe(
      true,
    );
  });

  it("keeps timer swap and grids off the fullscreen constraint", () => {
    const withTimers = toggleComplexityFlag(
      { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") },
      "timers",
      true,
    );
    expect(withTimers.timers).toBe(true);
    expect(withTimers.fullscreen).toBe(false);

    const withGrids = toggleGrids({ ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") }, true);
    expect(gridsVisible(withGrids)).toBe(true);
    expect(withGrids.fullscreen).toBe(false);
  });
});
