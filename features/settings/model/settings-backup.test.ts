import { describe, expect, it } from "vitest";
import {
  parseSettingsBackup,
  serializeSettingsBackup,
  settingsToRestore,
} from "@/features/settings/model/settings-backup";

describe("settings backup", () => {
  it("round-trips the settings keys and drops everything else", () => {
    const text = serializeSettingsBackup({
      displaySettings: { fontSize: 14 },
      mcpBridgeToken: "token",
      tabTimers: [{ tabId: 1 }],
    });
    expect(parseSettingsBackup(text)).toEqual({
      displaySettings: { fontSize: 14 },
      mcpBridgeToken: "token",
    });
  });

  it("reads a missing, corrupt or foreign backup as empty", () => {
    expect(parseSettingsBackup(null)).toEqual({});
    expect(parseSettingsBackup("{not json")).toEqual({});
    expect(parseSettingsBackup(JSON.stringify({ version: 99, data: {} }))).toEqual({});
  });

  it("restores into storage that holds no settings", () => {
    expect(
      settingsToRestore({ tabTimers: [] }, { displaySettings: { fontSize: 14 } }),
    ).toEqual({ displaySettings: { fontSize: 14 } });
  });

  it("leaves storage alone once any setting is present", () => {
    expect(
      settingsToRestore(
        { essentialTabNames: {} },
        { displaySettings: { fontSize: 14 }, essentialTabNames: { a: "A" } },
      ),
    ).toBeUndefined();
  });

  it("has nothing to restore from an empty backup", () => {
    expect(settingsToRestore({}, {})).toBeUndefined();
  });
});
