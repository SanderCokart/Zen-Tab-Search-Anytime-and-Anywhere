import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  saveDisplaySettings,
  subscribeToDisplaySettingsChanged,
} from "@/features/settings/model/display-settings";
import { MAX_FONT_SIZE, MIN_UI_SCALE } from "@/features/settings/model/ui-scale";

describe("display settings", () => {
  it("uses defaults and disables nested options when their parent setting is off", async () => {
    const get = vi.fn(async () => ({
      displaySettings: {
        detectForgeIssues: false,
        filterIssuesInOverlay: true,
        groupFolders: false,
        groupSubfolders: true,
      },
    }));
    const set = vi.fn(async () => undefined);
    const addListener = vi.fn();
    const removeListener = vi.fn();
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: { get, set },
          onChanged: { addListener, removeListener },
        },
      },
    });

    await expect(readDisplaySettings()).resolves.toEqual({
      ...DEFAULT_DISPLAY_SETTINGS,
      detectForgeIssues: false,
      filterIssuesInOverlay: false,
      groupFolders: false,
      groupSubfolders: false,
    });
    await expect(
      saveDisplaySettings({
        ...DEFAULT_DISPLAY_SETTINGS,
        detectForgeIssues: false,
        groupFolders: false,
      }),
    ).resolves.toEqual({
      ...DEFAULT_DISPLAY_SETTINGS,
      detectForgeIssues: false,
      filterIssuesInOverlay: false,
      groupFolders: false,
      groupSubfolders: false,
    });
    expect(set).toHaveBeenCalledWith({
      displaySettings: {
        ...DEFAULT_DISPLAY_SETTINGS,
        detectForgeIssues: false,
        filterIssuesInOverlay: false,
        groupFolders: false,
        groupSubfolders: false,
      },
    });
  });

  it("keeps space and essential visibility independent per surface", async () => {
    const get = vi.fn(async () => ({
      displaySettings: {
        hideSpacesInPopup: true,
        hideEssentialsInOverlay: true,
      },
    }));
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: { get, set: vi.fn(async () => undefined) },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });

    await expect(readDisplaySettings()).resolves.toEqual({
      ...DEFAULT_DISPLAY_SETTINGS,
      hideSpacesInPopup: true,
      hideEssentialsInOverlay: true,
    });
  });

  it("keeps the truncation toggles independent of each other", async () => {
    const get = vi.fn(async () => ({
      displaySettings: { truncateTabTitles: false, truncateIssueTitles: true },
    }));
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: { get, set: vi.fn(async () => undefined) },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });

    await expect(readDisplaySettings()).resolves.toEqual({
      ...DEFAULT_DISPLAY_SETTINGS,
      truncateTabTitles: false,
      truncateIssueTitles: true,
    });
  });

  it("falls back to every default when storage holds no object", async () => {
    for (const stored of [undefined, null, "nonsense", 42]) {
      Object.assign(globalThis, {
        browser: {
          storage: {
            local: { get: vi.fn(async () => ({ displaySettings: stored })), set: vi.fn() },
            onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
          },
        },
      });
      await expect(readDisplaySettings()).resolves.toEqual(DEFAULT_DISPLAY_SETTINGS);
    }
  });

  it("replaces only the unreadable fields, and normalises the rest", async () => {
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: {
            get: vi.fn(async () => ({
              displaySettings: {
                textColor: "not-a-color",
                issueBackgroundColor: "#ABCDEF",
                fontSize: 999,
                uiScale: -4,
                // Snapped to the nearest step rather than rejected.
                tabGap: 13,
                // Not finite, so this one alone falls back to its own default.
                folderGap: Number.NaN,
                truncateTabTitles: "yes",
              },
            })),
            set: vi.fn(),
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });

    await expect(readDisplaySettings()).resolves.toEqual({
      ...DEFAULT_DISPLAY_SETTINGS,
      issueBackgroundColor: "#ABCDEF",
      fontSize: MAX_FONT_SIZE,
      uiScale: MIN_UI_SCALE,
      tabGap: 12,
    });
  });

  it("subscribes to local settings changes and cleans up", () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: { get: vi.fn(), set: vi.fn() },
          onChanged: { addListener, removeListener },
        },
      },
    });
    const listener = vi.fn();

    const unsubscribe = subscribeToDisplaySettingsChanged(listener);
    const onChanged = addListener.mock.calls[0]?.[0] as (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => void;
    onChanged({ displaySettings: { newValue: { groupFolders: false } } }, "local");

    expect(listener).toHaveBeenCalledWith({
      ...DEFAULT_DISPLAY_SETTINGS,
      detectForgeIssues: true,
      groupFolders: false,
      groupSubfolders: false,
    });
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(onChanged);
  });
});
