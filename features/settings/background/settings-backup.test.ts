import { describe, expect, it, vi } from "vitest";
import { startSettingsBackup } from "@/features/settings/background/settings-backup";
import { serializeSettingsBackup } from "@/features/settings/model/settings-backup";

function setup(stored: Record<string, unknown>, backup: string | null) {
  const storage = { ...stored };
  const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
  const api = {
    readSettingsBackup: vi.fn(async () => backup),
    writeSettingsBackup: vi.fn(async (text: string) => {
      backup = text;
    }),
  };
  const onRestored = vi.fn();
  const start = () =>
    startSettingsBackup({
      api,
      readStorage: async (keys) =>
        Object.fromEntries(keys.filter((key) => key in storage).map((key) => [key, storage[key]])),
      writeStorage: async (values) => {
        Object.assign(storage, values);
      },
      onStorageChanged: (listener) => listeners.push(listener),
      onRestored,
      debounceMs: 10,
    });
  return { storage, api, onRestored, listeners, start, backup: () => backup };
}

describe("startSettingsBackup", () => {
  it("restores wiped settings and restarts the extension", async () => {
    const { storage, api, onRestored, start } = setup(
      {},
      serializeSettingsBackup({ displaySettings: { fontSize: 14 } }),
    );
    await start();
    expect(storage).toEqual({ displaySettings: { fontSize: 14 } });
    expect(onRestored).toHaveBeenCalledOnce();
    expect(api.writeSettingsBackup).not.toHaveBeenCalled();
  });

  it("backs up existing settings on start and again after they change", async () => {
    const { storage, onRestored, listeners, start, backup } = setup(
      { displaySettings: { fontSize: 12 } },
      null,
    );
    await start();
    expect(onRestored).not.toHaveBeenCalled();
    expect(backup()).toBe(serializeSettingsBackup({ displaySettings: { fontSize: 12 } }));

    storage.displaySettings = { fontSize: 16 };
    for (const listener of listeners) listener({ displaySettings: {} }, "local");
    await vi.waitFor(() =>
      expect(backup()).toBe(serializeSettingsBackup({ displaySettings: { fontSize: 16 } })),
    );
  });

  it("ignores changes to keys outside the backup", async () => {
    const { api, listeners, start } = setup({ displaySettings: {} }, null);
    await start();
    api.writeSettingsBackup.mockClear();
    for (const listener of listeners) listener({ tabTimers: {} }, "local");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.writeSettingsBackup).not.toHaveBeenCalled();
  });
});
