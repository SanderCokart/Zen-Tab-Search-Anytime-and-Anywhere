import { debugLog, debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import {
  BACKED_UP_STORAGE_KEYS,
  parseSettingsBackup,
  serializeSettingsBackup,
  settingsToRestore,
} from "@/features/settings/model/settings-backup";

/** The `zenBackup` experiment: a settings file in the profile that outlives an uninstall. */
export interface ZenBackupApi {
  readSettingsBackup(): Promise<string | null>;
  writeSettingsBackup(text: string): Promise<void>;
}

type StoredValues = Record<string, unknown>;
type ChangeListener = (changes: Record<string, unknown>, area: string) => void;

export interface SettingsBackupOptions {
  api?: ZenBackupApi;
  readStorage?: (keys: string[]) => Promise<StoredValues>;
  writeStorage?: (values: StoredValues) => Promise<void>;
  onStorageChanged?: (listener: ChangeListener) => void;
  /** Called after a restore. Restarts the extension so every service starts from the restored settings. */
  onRestored?: () => void;
  debounceMs?: number;
}

function getZenBackupApi(): ZenBackupApi | undefined {
  return (browser as typeof browser & { zenBackup?: ZenBackupApi }).zenBackup;
}

/**
 * Keeps the settings backup in step with storage.local, and refills storage
 * from it after an uninstall wiped it. Without the experiment this does nothing.
 */
export async function startSettingsBackup({
  api = getZenBackupApi(),
  readStorage = (keys) => browser.storage.local.get(keys),
  writeStorage = (values) => browser.storage.local.set(values),
  onStorageChanged = (listener) => browser.storage.onChanged.addListener(listener),
  onRestored = () => browser.runtime.reload(),
  debounceMs = 500,
}: SettingsBackupOptions = {}): Promise<void> {
  if (!api) {
    return;
  }
  const keys = [...BACKED_UP_STORAGE_KEYS];

  const restore = settingsToRestore(
    await readStorage(keys),
    parseSettingsBackup(await api.readSettingsBackup()),
  );
  if (restore) {
    await writeStorage(restore);
    debugLog(`${LOG_PREFIX} Restored settings from backup:`, Object.keys(restore));
    onRestored();
    return;
  }

  const save = async () => {
    try {
      await api.writeSettingsBackup(serializeSettingsBackup(await readStorage(keys)));
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not write settings backup:`, formatError(error));
    }
  };

  // Sliders on the settings page save on every step; write once they settle.
  let timer: ReturnType<typeof setTimeout> | undefined;
  onStorageChanged((changes, area) => {
    if (area !== "local" || !keys.some((key) => key in changes)) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void save(), debounceMs);
  });

  // Covers settings saved before this version, which had no backup.
  await save();
}
