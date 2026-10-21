import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const EXPERIMENTS = ["zenTabs", "zenHosts", "zenBackup", "zenUpdate"] as const;

function experimentSource(name: (typeof EXPERIMENTS)[number]): string {
  // Vitest runs from the repo root.
  return readFileSync(path.resolve("public/experiment", name, "api.js"), "utf8");
}

describe("experiment scripts", () => {
  it("load side by side in one shared global, as Firefox runs them", () => {
    // Firefox evaluates every experiment script of an add-on in the same global,
    // so a top-level declaration in one (say `const DEBUG`) breaks the other.
    const global = vm.createContext({ ExtensionAPI: class {} });
    for (const name of EXPERIMENTS) {
      expect(() =>
        vm.runInContext(experimentSource(name), global, { filename: name }),
      ).not.toThrow();
    }
    for (const name of EXPERIMENTS) {
      expect(typeof (global as Record<string, unknown>)[name]).toBe("function");
    }
  });
});

describe("zenUpdate", () => {
  const url =
    "https://github.com/SanderCokart/Zen-Tab-Search-Anytime-and-Anywhere/releases/download/v4.0.2/zen-tab-search-v4.0.2-firefox.zip";

  /** Runs the experiment against a fake AddonManager whose download holds `addon`. */
  function installer(addon: { id: string; version: string }) {
    type Listener = Record<string, ((install: unknown) => unknown) | undefined>;
    const listeners = new Set<Listener>();
    const install = {
      addon,
      cancelled: false,
      installed: false,
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      cancel() {
        install.cancelled = true;
      },
      install() {
        for (const listener of [...listeners]) {
          if (listener.onDownloadEnded?.(install) === false) return;
        }
        install.installed = true;
        for (const listener of [...listeners]) listener.onInstallEnded?.(install);
      },
    };
    const getInstallForURL = async () => install;
    const global = vm.createContext({
      ExtensionAPI: class {},
      ChromeUtils: {
        importESModule: (module: string) => {
          if (module.endsWith("AddonManager.sys.mjs")) {
            return { AddonManager: { getInstallForURL } };
          }
          throw new Error(`No ${module} in tests.`);
        },
      },
    });
    vm.runInContext(experimentSource("zenUpdate"), global);
    const Api = (global as Record<string, new () => { getAPI(context: unknown): unknown }>)
      .zenUpdate!;
    const api = new Api().getAPI({ extension: { id: "zen-tab-search@extension.example" } }) as {
      zenUpdate: { installFromUrl(url: string, version: string): Promise<void> };
    };
    return { install, installFromUrl: api.zenUpdate.installFromUrl };
  }

  it("installs this add-on's release at the expected version", async () => {
    const { install, installFromUrl } = installer({
      id: "zen-tab-search@extension.example",
      version: "4.0.2",
    });
    await expect(installFromUrl(url, "4.0.2")).resolves.toBeUndefined();
    expect(install.installed).toBe(true);
  });

  it("refuses URLs outside the repository's releases", async () => {
    const { installFromUrl } = installer({
      id: "zen-tab-search@extension.example",
      version: "4.0.2",
    });
    await expect(installFromUrl("https://evil.test/a.zip", "4.0.2")).rejects.toThrow(
      "GitHub releases",
    );
  });

  it("cancels a download that holds another add-on or another version", async () => {
    const other = installer({ id: "someone-else@example", version: "4.0.2" });
    await expect(other.installFromUrl(url, "4.0.2")).rejects.toThrow("not this add-on");
    expect(other.install.cancelled).toBe(true);
    expect(other.install.installed).toBe(false);

    const older = installer({ id: "zen-tab-search@extension.example", version: "4.0.1" });
    await expect(older.installFromUrl(url, "4.0.2")).rejects.toThrow("version 4.0.1, not 4.0.2");
    expect(older.install.installed).toBe(false);
  });
});
