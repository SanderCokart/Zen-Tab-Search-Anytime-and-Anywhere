/* global ExtensionAPI, ChromeUtils */

/**
 * Updates the add-on in place from a GitHub release.
 *
 * The add-on is sideloaded, so Firefox never offers it an update on its own.
 * AddonManager installs the release package over the running add-on the same
 * way an update would: storage.local is kept and the add-on restarts on the
 * new version. The package must be a release asset of this repository and
 * must contain this add-on at the expected version, or nothing is installed.
 */

// Every experiment script of an add-on shares one global; keep everything local.
(() => {
  // Must match RELEASE_DOWNLOAD_PREFIX in features/updates/model/release.ts.
  const RELEASE_DOWNLOAD_PREFIX =
    "https://github.com/SanderCokart/Zen-Tab-Search-Anytime-and-Anywhere/releases/download/";

  function getExtensionError() {
    try {
      return ChromeUtils.importESModule("resource://gre/modules/ExtensionUtils.sys.mjs")
        .ExtensionUtils.ExtensionError;
    } catch {
      return undefined;
    }
  }

  /** Rethrows as ExtensionError so the message reaches the extension. Same as zenBackup. */
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

  async function installFromUrl(extension, url, version) {
    if (typeof url !== "string" || !url.startsWith(RELEASE_DOWNLOAD_PREFIX)) {
      throw new Error("Updates are only installed from this add-on's GitHub releases.");
    }
    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs",
    );
    const install = await AddonManager.getInstallForURL(url, {
      telemetryInfo: { source: "extension" },
    });

    return new Promise((resolve, reject) => {
      const fail = (message) => {
        install.removeListener(listener);
        reject(new Error(message));
      };
      const listener = {
        onDownloadEnded(finished) {
          const addon = finished.addon;
          if (addon?.id !== extension.id) {
            finished.cancel();
            fail("The downloaded package is not this add-on.");
            return false;
          }
          if (addon.version !== version) {
            finished.cancel();
            fail(`The downloaded package is version ${addon.version}, not ${version}.`);
            return false;
          }
          return undefined;
        },
        onDownloadFailed: () => fail("Could not download the update."),
        onDownloadCancelled: () => fail("The update download was cancelled."),
        onInstallFailed: () => fail("Firefox could not install the update."),
        onInstallCancelled: () => fail("The update was cancelled."),
        onInstallEnded: () => {
          install.removeListener(listener);
          resolve();
        },
      };
      install.addListener(listener);
      install.install();
    });
  }

  this.zenUpdate = class extends ExtensionAPI {
    getAPI(context) {
      const extension = context.extension;
      return {
        zenUpdate: exposeErrors({
          async installFromUrl(url, version) {
            await installFromUrl(extension, url, version);
          },
        }),
      };
    }
  };
})();
