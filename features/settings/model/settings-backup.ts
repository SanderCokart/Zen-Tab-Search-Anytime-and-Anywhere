import * as v from "valibot";

/**
 * The storage.local keys that hold user settings, and so go into the backup.
 * Tab-bound data (timers, last-opened times) stays out: tab IDs do not outlive
 * the session, so restoring it would attach it to the wrong tabs.
 */
export const BACKED_UP_STORAGE_KEYS = [
  "displaySettings",
  "globalHostOverrides",
  "essentialTabNames",
  "mcpBridgeToken",
] as const;

const BACKUP_VERSION = 1;

const backupSchema = v.object({
  version: v.literal(BACKUP_VERSION),
  data: v.record(v.string(), v.unknown()),
});

type StoredValues = Record<string, unknown>;

/** Only the backed-up keys that are present, so a removed setting stays removed. */
function pickBackedUp(stored: StoredValues): StoredValues {
  return Object.fromEntries(
    BACKED_UP_STORAGE_KEYS.flatMap((key) =>
      stored[key] === undefined ? [] : [[key, stored[key]] as const],
    ),
  );
}

export function serializeSettingsBackup(stored: StoredValues): string {
  return JSON.stringify({ version: BACKUP_VERSION, data: pickBackedUp(stored) });
}

/** The backed-up values, or an empty object when the text is missing or unreadable. */
export function parseSettingsBackup(text: string | null | undefined): StoredValues {
  if (!text) {
    return {};
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {};
  }
  const parsed = v.safeParse(backupSchema, json);
  return parsed.success ? pickBackedUp(parsed.output.data) : {};
}

/**
 * The values to write back, or undefined when there is nothing to restore.
 *
 * Restores only into storage that holds none of the settings, which is what an
 * uninstall leaves behind. Once any setting exists the storage is the user's
 * current state and the backup must not overwrite it.
 */
export function settingsToRestore(
  stored: StoredValues,
  backup: StoredValues,
): StoredValues | undefined {
  if (Object.keys(pickBackedUp(stored)).length > 0) {
    return undefined;
  }
  const restore = pickBackedUp(backup);
  return Object.keys(restore).length > 0 ? restore : undefined;
}
