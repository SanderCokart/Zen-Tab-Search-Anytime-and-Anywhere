import * as v from "valibot";
import { DEBUG, debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { latestReleaseSchema } from "@/shared/messaging/protocol";
import type { LatestRelease, UpdateStatus } from "@/shared/types";
import { LATEST_RELEASE_API_URL, parseLatestRelease } from "@/features/updates/model/release";
import { isNewerVersion } from "@/features/updates/model/version";

/** The last update check, kept so each omnibar open does not ask GitHub again. */
export const UPDATE_CHECK_STORAGE_KEY = "updateCheck";

/** How old a check may be before the next status request asks GitHub again. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const UPDATE_ALARM = "update-check";

const storedUpdateCheckSchema = v.object({
  checkedAt: v.number(),
  latest: v.nullable(latestReleaseSchema),
});

type StoredUpdateCheck = v.InferOutput<typeof storedUpdateCheckSchema>;

/** The `zenUpdate` experiment: installs a release package over the running add-on. */
interface ZenUpdateApi {
  installFromUrl(url: string, version: string): Promise<void>;
}

export interface UpdateServiceDeps {
  currentVersion: () => string;
  /** GitHub's latest-release response, unparsed. */
  fetchLatestRelease: () => Promise<unknown>;
  readCheck: () => Promise<unknown>;
  writeCheck: (check: StoredUpdateCheck) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  installer: () => ZenUpdateApi | undefined;
  now: () => number;
  /**
   * Offers the latest release even when it is not newer, so a debug build can
   * replace itself to demo the update. Off outside `WXT_DEBUG=true`.
   */
  demo: boolean;
}

function defaultDeps(): UpdateServiceDeps {
  return {
    currentVersion: () => browser.runtime.getManifest().version,
    fetchLatestRelease: async () => {
      const response = await fetch(LATEST_RELEASE_API_URL, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`GitHub answered ${response.status}.`);
      }
      return response.json();
    },
    readCheck: async () =>
      (await browser.storage.local.get(UPDATE_CHECK_STORAGE_KEY))[UPDATE_CHECK_STORAGE_KEY],
    writeCheck: (check) => browser.storage.local.set({ [UPDATE_CHECK_STORAGE_KEY]: check }),
    openUrl: async (url) => {
      await browser.tabs.create({ url });
    },
    installer: () => (browser as typeof browser & { zenUpdate?: ZenUpdateApi }).zenUpdate,
    now: () => Date.now(),
    demo: DEBUG,
  };
}

export function createUpdateService(overrides: Partial<UpdateServiceDeps> = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  let pendingCheck: Promise<StoredUpdateCheck | undefined> | undefined;

  async function readCheck(): Promise<StoredUpdateCheck | undefined> {
    const parsed = v.safeParse(storedUpdateCheckSchema, await deps.readCheck());
    return parsed.success ? parsed.output : undefined;
  }

  /** Asks GitHub for the latest release. Concurrent callers share one request. */
  function check(): Promise<StoredUpdateCheck | undefined> {
    pendingCheck ??= (async () => {
      try {
        const latest = parseLatestRelease(await deps.fetchLatestRelease()) ?? null;
        const stored = { checkedAt: deps.now(), latest };
        await deps.writeCheck(stored);
        return stored;
      } catch (error) {
        debugWarn(`${LOG_PREFIX} Could not check for updates:`, formatError(error));
        return undefined;
      } finally {
        pendingCheck = undefined;
      }
    })();
    return pendingCheck;
  }

  function toStatus(latest: LatestRelease | null): UpdateStatus {
    const currentVersion = deps.currentVersion();
    const newer = latest !== null && isNewerVersion(latest.version, currentVersion);
    const demo = !newer && latest !== null && deps.demo;
    return {
      currentVersion,
      latest,
      updateAvailable: newer || demo,
      demo,
      canInstall: deps.installer() !== undefined,
    };
  }

  /**
   * The installed version against the newest release. Uses the stored check
   * unless it is older than the interval or `force` asks for a fresh one; a
   * failed check falls back to whatever was stored.
   */
  async function getStatus(force = false): Promise<UpdateStatus> {
    const stored = await readCheck();
    const stale = !stored || deps.now() - stored.checkedAt >= UPDATE_CHECK_INTERVAL_MS;
    const current = force || stale ? ((await check()) ?? stored) : stored;
    return toStatus(current?.latest ?? null);
  }

  async function availableUpdate(): Promise<LatestRelease> {
    const status = await getStatus();
    if (!status.updateAvailable || !status.latest) {
      throw new Error("Zen Tab Search is up to date.");
    }
    return status.latest;
  }

  return {
    getStatus,

    /** Opens the release zip in a new tab, which Firefox downloads, or the release page. */
    async open(page: "download" | "releaseNotes"): Promise<void> {
      const latest = await availableUpdate();
      await deps.openUrl(page === "download" ? latest.zipUrl : latest.releaseUrl);
    },

    /** Installs the newer release over this one; the add-on restarts once it is in. */
    async install(): Promise<void> {
      const installer = deps.installer();
      if (!installer) {
        throw new Error("Installing updates needs the Zen experiment APIs.");
      }
      const latest = await availableUpdate();
      await installer.installFromUrl(latest.zipUrl, latest.version);
    },
  };
}

export type UpdateService = ReturnType<typeof createUpdateService>;

/** Checks at startup and every few hours after, so the omnibar rarely has to wait on GitHub. */
export function registerUpdateChecks(service: UpdateService): void {
  const refresh = () =>
    void service.getStatus().catch((error) => {
      debugWarn(`${LOG_PREFIX} Could not check for updates:`, formatError(error));
    });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPDATE_ALARM) refresh();
  });
  void browser.alarms.create(UPDATE_ALARM, {
    periodInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000,
  });
  refresh();
}
