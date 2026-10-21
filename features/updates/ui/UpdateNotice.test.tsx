import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateNotice } from "@/features/updates/ui/UpdateNotice";
import type { UpdateStatus } from "@/shared/types";

const latest = {
  version: "4.0.2",
  zipUrl: "https://github.com/x/y/releases/download/v4.0.2/zen-tab-search-v4.0.2-firefox.zip",
  releaseUrl: "https://github.com/x/y/releases/tag/v4.0.2",
};

function mountUpdateNotice(
  status: Omit<UpdateStatus, "checkedAt"> & { checkedAt?: number | null },
  installResponse: unknown = undefined,
  forcedStatus?: UpdateStatus,
) {
  const initial: UpdateStatus = { checkedAt: 1_000, ...status };
  const sendMessage = vi.fn(async ({ type, force }: { type: string; force?: boolean }) => {
    if (type === "getUpdateStatus") return force && forcedStatus ? forcedStatus : initial;
    if (type === "installUpdate") return installResponse;
    return undefined;
  });
  Object.assign(globalThis, {
    browser: { runtime: { sendMessage } },
  });
  const root = document.createElement("div");
  root.setAttribute("data-zen-ui", "");
  document.body.appendChild(root);
  render(<UpdateNotice />, root);
  return { root, sendMessage };
}

const testId = (root: Element, id: string) =>
  root.querySelector<HTMLElement>(`[data-testid='zen-update-${id}']`);

describe("UpdateNotice", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    Reflect.deleteProperty(globalThis, "browser");
  });

  it("names the latest version with the changed part lit, and the installed one on hover", async () => {
    const { root } = mountUpdateNotice({
      currentVersion: "4.0.0",
      latest,
      updateAvailable: true,
      demo: false,
      canInstall: true,
    });
    await vi.waitFor(() => expect(testId(root, "notice")).toBeTruthy());

    expect(testId(root, "notice")!.textContent).toContain(
      "There is a new version available! Latest:4.0.2",
    );
    const changed = [...testId(root, "latest")!.querySelectorAll("[data-changed]")];
    expect(changed.map((part) => part.textContent)).toEqual(["2"]);

    root.querySelector("button")!.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.waitFor(() =>
      expect(root.querySelector("[role='tooltip']")?.textContent).toBe("You are on version 4.0.0"),
    );
  });

  it("offers install, download and release notes once clicked", async () => {
    const { root, sendMessage } = mountUpdateNotice({
      currentVersion: "4.0.0",
      latest,
      updateAvailable: true,
      demo: false,
      canInstall: true,
    });
    await vi.waitFor(() => expect(testId(root, "notice")).toBeTruthy());
    expect(testId(root, "panel")).toBeNull();

    root.querySelector("button")!.click();
    await vi.waitFor(() => expect(testId(root, "panel")).toBeTruthy());

    testId(root, "download")!.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: "openUpdate", page: "download" });

    testId(root, "install")!.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: "installUpdate" });
    await vi.waitFor(() => expect(testId(root, "install")!.textContent).toBe("Installing…"));
  });

  it("shows why an install failed", async () => {
    const { root } = mountUpdateNotice(
      { currentVersion: "4.0.0", latest, updateAvailable: true, demo: false, canInstall: true },
      { error: "Firefox could not install the update." },
    );
    await vi.waitFor(() => expect(testId(root, "notice")).toBeTruthy());
    root.querySelector("button")!.click();
    await vi.waitFor(() => expect(testId(root, "install")).toBeTruthy());

    testId(root, "install")!.click();

    await vi.waitFor(() =>
      expect(root.querySelector("[role='alert']")?.textContent).toContain(
        "Firefox could not install the update.",
      ),
    );
  });

  it("leaves out install when the experiment is missing, and shows nothing when up to date", async () => {
    const withoutInstall = mountUpdateNotice({
      currentVersion: "4.0.0",
      latest,
      updateAvailable: true,
      demo: false,
      canInstall: false,
    });
    await vi.waitFor(() => expect(testId(withoutInstall.root, "notice")).toBeTruthy());
    withoutInstall.root.querySelector("button")!.click();
    await vi.waitFor(() => expect(testId(withoutInstall.root, "download")).toBeTruthy());
    expect(testId(withoutInstall.root, "install")).toBeNull();

    const upToDate = mountUpdateNotice({
      currentVersion: "4.0.2",
      latest,
      updateAvailable: false,
      demo: false,
      canInstall: true,
    });
    await vi.waitFor(() => expect(testId(upToDate.root, "check")).toBeTruthy());
    expect(testId(upToDate.root, "notice")).toBeNull();
    expect(testId(upToDate.root, "check")!.textContent).toContain("v4.0.2");
  });

  it("checks GitHub now from the check for updates button", async () => {
    const status = {
      currentVersion: "4.0.0",
      latest: null,
      updateAvailable: false,
      demo: false,
      canInstall: true,
    };
    const { root, sendMessage } = mountUpdateNotice(status, undefined, {
      ...status,
      latest,
      updateAvailable: true,
      checkedAt: 2_000,
    });
    await vi.waitFor(() => expect(testId(root, "check-button")).toBeTruthy());

    testId(root, "check-button")!.click();

    expect(sendMessage).toHaveBeenCalledWith({ type: "getUpdateStatus", force: true });
    await vi.waitFor(() => expect(testId(root, "notice")).toBeTruthy());
    expect(testId(root, "check")).toBeNull();
  });

  it.each([
    { checkedAt: 2_000, result: "Up to date" },
    { checkedAt: 1_000, result: "Could not reach GitHub" },
  ])("says $result after a check that finds no update", async ({ checkedAt, result }) => {
    const status = {
      currentVersion: "4.0.2",
      latest,
      updateAvailable: false,
      demo: false,
      canInstall: true,
    };
    const { root } = mountUpdateNotice(status, undefined, { ...status, checkedAt });
    await vi.waitFor(() => expect(testId(root, "check-button")).toBeTruthy());

    testId(root, "check-button")!.click();

    await vi.waitFor(() => expect(testId(root, "result")?.textContent).toBe(result));
  });

  it("labels a debug build's offer to replace itself with the same release", async () => {
    const { root } = mountUpdateNotice({
      currentVersion: "4.0.2",
      latest,
      updateAvailable: true,
      demo: true,
      canInstall: true,
    });
    await vi.waitFor(() => expect(testId(root, "notice")).toBeTruthy());

    expect(testId(root, "notice")!.textContent).toContain("(debug demo)");
    expect(testId(root, "latest")!.querySelectorAll("[data-changed]")).toHaveLength(0);
    root.querySelector("button")!.click();
    await vi.waitFor(() =>
      expect(testId(root, "panel")?.textContent).toContain(
        "Debug build: replace this 4.0.2 build with the 4.0.2 release?",
      ),
    );
    expect(testId(root, "install")).toBeTruthy();
  });
});
