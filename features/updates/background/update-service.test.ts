import { describe, expect, it, vi } from "vitest";
import {
  createUpdateService,
  UPDATE_CHECK_INTERVAL_MS,
  type UpdateServiceDeps,
} from "@/features/updates/background/update-service";
import { RELEASE_DOWNLOAD_PREFIX } from "@/features/updates/model/release";

const zipUrl = `${RELEASE_DOWNLOAD_PREFIX}v4.0.2/zen-tab-search-v4.0.2-firefox.zip`;

const githubRelease = {
  tag_name: "v4.0.2",
  html_url: "https://github.com/x/y/releases/tag/v4.0.2",
  assets: [{ name: "zen-tab-search-v4.0.2-firefox.zip", browser_download_url: zipUrl }],
};

const latest = {
  version: "4.0.2",
  zipUrl,
  releaseUrl: "https://github.com/x/y/releases/tag/v4.0.2",
};

function setup(overrides: Partial<UpdateServiceDeps> = {}) {
  let stored: unknown;
  const installFromUrl = vi.fn(async () => undefined);
  const fetchLatestRelease = vi.fn(async (): Promise<unknown> => githubRelease);
  const deps = {
    currentVersion: () => "4.0.0",
    fetchLatestRelease,
    readCheck: async () => stored,
    writeCheck: vi.fn(async (check: unknown) => {
      stored = check;
    }),
    openUrl: vi.fn(async () => undefined),
    installer: () => ({ installFromUrl }),
    now: () => 1_000_000,
    demo: false,
    ...overrides,
  };
  return { service: createUpdateService(deps), deps, fetchLatestRelease, installFromUrl };
}

describe("update service", () => {
  it("reports a newer release and stores the check", async () => {
    const { service, deps } = setup();

    await expect(service.getStatus()).resolves.toEqual({
      currentVersion: "4.0.0",
      latest,
      updateAvailable: true,
      demo: false,
      canInstall: true,
      checkedAt: 1_000_000,
    });
    expect(deps.writeCheck).toHaveBeenCalledWith({ checkedAt: 1_000_000, latest });
  });

  it("is up to date when the latest release is the installed version", async () => {
    const { service } = setup({ currentVersion: () => "4.0.2" });

    await expect(service.getStatus()).resolves.toMatchObject({ updateAvailable: false });
  });

  it("lets a debug build install the latest release over itself", async () => {
    const { service, installFromUrl } = setup({ currentVersion: () => "4.0.2", demo: true });

    await expect(service.getStatus()).resolves.toMatchObject({
      updateAvailable: true,
      demo: true,
    });
    await service.install();
    expect(installFromUrl).toHaveBeenCalledWith(zipUrl, "4.0.2");
  });

  it("does not call a newer release a demo, even in a debug build", async () => {
    const { service } = setup({ demo: true });

    await expect(service.getStatus()).resolves.toMatchObject({
      updateAvailable: true,
      demo: false,
    });
  });

  it("reuses a recent check and asks GitHub again once it is stale or forced", async () => {
    let now = 1_000_000;
    const { service, deps } = setup({ now: () => now });

    await service.getStatus();
    await service.getStatus();
    expect(deps.fetchLatestRelease).toHaveBeenCalledTimes(1);

    await service.getStatus(true);
    expect(deps.fetchLatestRelease).toHaveBeenCalledTimes(2);

    now += UPDATE_CHECK_INTERVAL_MS;
    await service.getStatus();
    expect(deps.fetchLatestRelease).toHaveBeenCalledTimes(3);
  });

  it("keeps the last good check when GitHub fails", async () => {
    let now = 1_000_000;
    const { service, fetchLatestRelease } = setup({ now: () => now });
    await service.getStatus();

    fetchLatestRelease.mockRejectedValueOnce(new Error("offline"));
    now += UPDATE_CHECK_INTERVAL_MS;

    await expect(service.getStatus()).resolves.toMatchObject({
      latest,
      updateAvailable: true,
      checkedAt: 1_000_000,
    });
  });

  it("reports no check time until GitHub has answered once", async () => {
    const { service, fetchLatestRelease } = setup();
    fetchLatestRelease.mockRejectedValueOnce(new Error("offline"));

    await expect(service.getStatus(true)).resolves.toMatchObject({
      latest: null,
      updateAvailable: false,
      checkedAt: null,
    });
  });

  it("opens the zip or the release page, and installs the zip in place", async () => {
    const { service, deps, installFromUrl } = setup();

    await service.open("download");
    await service.open("releaseNotes");
    await service.install();

    expect(deps.openUrl).toHaveBeenNthCalledWith(1, zipUrl);
    expect(deps.openUrl).toHaveBeenNthCalledWith(2, latest.releaseUrl);
    expect(installFromUrl).toHaveBeenCalledWith(zipUrl, "4.0.2");
  });

  it("refuses to install without an update or the experiment", async () => {
    await expect(setup({ currentVersion: () => "4.0.2" }).service.install()).rejects.toThrow(
      "up to date",
    );
    const withoutExperiment = setup({ installer: () => undefined });
    await expect(withoutExperiment.service.install()).rejects.toThrow("experiment");
    await expect(withoutExperiment.service.getStatus()).resolves.toMatchObject({
      canInstall: false,
    });
  });
});
