import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  saveDisplaySettings,
  subscribeToDisplaySettingsChanged,
} from "@/features/settings/model/display-settings";

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
