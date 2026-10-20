/* global ExtensionAPI, ChromeUtils, Cc, Ci */

/**
 * A copy of the extension's settings in a file in the browser profile.
 *
 * Firefox deletes an add-on's storage.local when the add-on is uninstalled,
 * which includes a temporary add-on loaded from about:debugging being removed
 * or replaced. Updating in place keeps it, but any uninstall-and-reinstall
 * loses every setting. This file is outside the add-on's storage, so it
 * survives, and the background script restores from it when storage is empty.
 */

// Every experiment script of an add-on shares one global; keep everything local.
(() => {
  const FILE_NAME = "zen-tab-search-settings.json";
  const MAX_BYTES = 1024 * 1024;

  function getBackupFile() {
    const file = Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
      .get("ProfD", Ci.nsIFile);
    file.append(FILE_NAME);
    return file;
  }

  /** Escapes everything outside ASCII so the file can be written and read as plain bytes. */
  function toAscii(text) {
    return text.replace(
      /[\u007f-￿]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
  }

  function readBackup() {
    const file = getBackupFile();
    if (!file.exists()) {
      return null;
    }
    if (file.fileSize > MAX_BYTES) {
      throw new Error("Settings backup is too large.");
    }
    const input = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
      Ci.nsIFileInputStream,
    );
    input.init(file, -1, 0, 0);
    const scriptable = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream,
    );
    scriptable.init(input);
    try {
      return scriptable.read(file.fileSize);
    } finally {
      scriptable.close();
    }
  }

  function writeBackup(text) {
    if (typeof text !== "string") {
      throw new Error("Settings backup must be a string.");
    }
    const data = toAscii(text);
    if (data.length > MAX_BYTES) {
      throw new Error("Settings backup is too large.");
    }
    // The safe stream writes a temporary file and renames it on finish, so a
    // crash mid-write cannot leave a truncated backup behind.
    const output = Cc["@mozilla.org/network/safe-file-output-stream;1"].createInstance(
      Ci.nsIFileOutputStream,
    );
    // PR_WRONLY | PR_CREATE_FILE | PR_TRUNCATE
    output.init(getBackupFile(), 0x02 | 0x08 | 0x20, 0o600, 0);
    try {
      output.write(data, data.length);
      output.QueryInterface(Ci.nsISafeOutputStream).finish();
    } catch (error) {
      output.close();
      throw error;
    }
  }

  function getExtensionError() {
    try {
      return ChromeUtils.importESModule("resource://gre/modules/ExtensionUtils.sys.mjs")
        .ExtensionUtils.ExtensionError;
    } catch {
      return undefined;
    }
  }

  /** Rethrows as ExtensionError so the message reaches the extension. Same as zenHosts. */
  function exposeErrors(api) {
    const ExtensionError = getExtensionError();
    if (!ExtensionError) {
      return api;
    }
    return Object.fromEntries(
      Object.entries(api).map(([name, method]) => [
        name,
        async (...args) => {
          try {
            return await method(...args);
          } catch (error) {
            if (error instanceof ExtensionError) {
              throw error;
            }
            throw new ExtensionError(error?.message || String(error) || `${name} failed`);
          }
        },
      ]),
    );
  }

  this.zenBackup = class extends ExtensionAPI {
    getAPI() {
      return {
        zenBackup: exposeErrors({
          async readSettingsBackup() {
            return readBackup();
          },
          async writeSettingsBackup(text) {
            writeBackup(text);
          },
        }),
      };
    }
  };
})();
