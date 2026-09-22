import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerExternalTabReuse,
  reuseOpenedExternalTab,
  type ExternalTabReuseDeps,
} from "@/features/intercept/background/external-tab";

const ISSUE = "https://gitlab.example.com/group/app/-/issues/42";

function deps(
  partial: Partial<ExternalTabReuseDeps> & Pick<ExternalTabReuseDeps, "consumeExternalTab">,
): ExternalTabReuseDeps {
  return {
    listTabs: vi.fn(async () => [
      { id: 4, url: ISSUE, lastOpenedAt: 20 },
      { id: 9, url: ISSUE, lastOpenedAt: 1 },
    ]),
    activateTab: vi.fn(async () => undefined),
    removeTab: vi.fn(async () => undefined),
    recordOpened: vi.fn(async () => undefined),
    isEnabled: vi.fn(async () => true),
    ...partial,
  };
}

describe("reuseOpenedExternalTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("focuses the existing tab and closes the one an external app just opened", async () => {
    const harness = deps({
      consumeExternalTab: vi.fn(async () => `${ISSUE}?utm_source=email`),
    });

    await reuseOpenedExternalTab(9, harness);

    expect(harness.activateTab).toHaveBeenCalledWith(4, undefined, 9);
    expect(harness.removeTab).toHaveBeenCalledWith(9);
    expect(harness.recordOpened).toHaveBeenCalledWith(4);
  });

  it("leaves the new tab when the URL is not already open", async () => {
    const harness = deps({
      consumeExternalTab: vi.fn(async () => "https://gitlab.example.com/group/app/-/issues/99"),
    });

    await reuseOpenedExternalTab(9, harness);

    expect(harness.activateTab).not.toHaveBeenCalled();
    expect(harness.removeTab).not.toHaveBeenCalled();
  });

  it("ignores tabs that were not opened by an external application", async () => {
    const consumeExternalTab = vi.fn(async () => "");
    const harness = deps({ consumeExternalTab });

    await reuseOpenedExternalTab(9, harness);

    expect(consumeExternalTab).toHaveBeenCalledTimes(2);
    expect(harness.removeTab).not.toHaveBeenCalled();
  });

  it("leaves the new tab when reuse is turned off", async () => {
    const harness = deps({
      consumeExternalTab: vi.fn(async () => ISSUE),
      isEnabled: vi.fn(async () => false),
    });

    await reuseOpenedExternalTab(9, harness);

    expect(harness.consumeExternalTab).toHaveBeenCalledWith(9);
    expect(harness.activateTab).not.toHaveBeenCalled();
    expect(harness.removeTab).not.toHaveBeenCalled();
  });

  it("does not close the new tab when focusing the existing one fails", async () => {
    const harness = deps({
      consumeExternalTab: vi.fn(async () => ISSUE),
      activateTab: vi.fn(async () => {
        throw new Error("space switch failed");
      }),
    });

    await reuseOpenedExternalTab(9, harness);

    expect(harness.removeTab).not.toHaveBeenCalled();
  });
});

describe("registerExternalTabReuse", () => {
  it("claims external opens after the tab has been created", async () => {
    const listeners = new Set<(tab: { id?: number }) => void>();
    const consumeExternalTab = vi.fn(async (tabId: number) => (tabId === 9 ? ISSUE : ""));
    const harness = deps({ consumeExternalTab });
    const stop = registerExternalTabReuse({
      ...harness,
      onCreated: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
    });

    expect(consumeExternalTab).toHaveBeenCalledWith(-1);
    const listener = [...listeners][0];
    listener?.({ id: 9 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    expect(harness.removeTab).toHaveBeenCalledWith(9);
    stop();
    expect(listeners.size).toBe(0);
  });
});
