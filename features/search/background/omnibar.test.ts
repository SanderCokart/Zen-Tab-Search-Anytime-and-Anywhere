import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleOmnibar } from "@/features/search/background/omnibar";
import { sendTabMessage } from "@/shared/messaging/client";
import { resolveAnchorTabId } from "@/features/zen/anchor";
import { showOmnibarOverlay, toggleOmnibarOverlay } from "@/features/zen/omnibar-overlay";

vi.mock("@/shared/messaging/client", () => ({
  sendTabMessage: vi.fn(async () => undefined),
}));

vi.mock("@/features/zen/anchor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/zen/anchor")>();
  return {
    ...actual,
    resolveAnchorTabId: vi.fn(actual.resolveAnchorTabId),
  };
});

// Without the experiment the window-hosted omnibar is unavailable, as in jsdom.
vi.mock("@/features/zen/omnibar-overlay", () => ({
  toggleOmnibarOverlay: vi.fn(async () => undefined),
  showOmnibarOverlay: vi.fn(async () => true),
  hideOmnibarOverlay: vi.fn(async () => true),
  preloadOmnibarOverlay: vi.fn(async () => true),
}));

const sendTabMessageMock = vi.mocked(sendTabMessage);
const toggleOmnibarOverlayMock = vi.mocked(toggleOmnibarOverlay);
const resolveAnchorTabIdMock = vi.mocked(resolveAnchorTabId);

describe("toggleOmnibar", () => {
  afterEach(() => {
    sendTabMessageMock.mockReset();
    resolveAnchorTabIdMock.mockReset();
    toggleOmnibarOverlayMock.mockReset();
    toggleOmnibarOverlayMock.mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  it("toggles the overlay on the focused window's tab, not the first window", async () => {
    resolveAnchorTabIdMock.mockResolvedValue(20);
    Object.assign(globalThis, {
      browser: {
        tabs: {
          get: vi.fn(async () => ({ id: 20, url: "https://second.test" })),
        },
      },
    });

    await toggleOmnibar();

    expect(resolveAnchorTabIdMock).toHaveBeenCalledWith(undefined);
    expect(sendTabMessageMock).toHaveBeenCalledWith(20, {
      type: "toggleOmnibar",
      anchorTabId: 20,
    });
  });

  it("uses the command tab when Firefox provides one", async () => {
    resolveAnchorTabIdMock.mockResolvedValue(20);
    Object.assign(globalThis, {
      browser: {
        tabs: {
          get: vi.fn(async () => ({ id: 20, url: "https://second.test" })),
        },
      },
    });

    await toggleOmnibar(20);

    expect(resolveAnchorTabIdMock).toHaveBeenCalledWith(20);
    expect(sendTabMessageMock).toHaveBeenCalledWith(20, {
      type: "toggleOmnibar",
      anchorTabId: 20,
    });
  });

  it("skips the tab lookup when the command tab's URL is known, and warms the snapshot", async () => {
    resolveAnchorTabIdMock.mockResolvedValue(20);
    const get = vi.fn(async () => ({ id: 20, url: "https://second.test" }));
    Object.assign(globalThis, { browser: { tabs: { get } } });
    const warmSnapshot = vi.fn();

    await toggleOmnibar(20, { preferredUrl: "https://second.test", warmSnapshot });

    expect(get).not.toHaveBeenCalled();
    expect(warmSnapshot).toHaveBeenCalledWith(20);
    expect(sendTabMessageMock).toHaveBeenCalledWith(20, {
      type: "toggleOmnibar",
      anchorTabId: 20,
    });
  });

  it("does not warm the snapshot for a page the overlay cannot open on", async () => {
    resolveAnchorTabIdMock.mockResolvedValue(20);
    Object.assign(globalThis, { browser: { tabs: { get: vi.fn() } } });
    const warmSnapshot = vi.fn();

    await toggleOmnibar(20, { preferredUrl: "about:config", warmSnapshot });

    expect(warmSnapshot).not.toHaveBeenCalled();
  });

  it("warms the window-hosted omnibar's snapshot before it remounts the page", async () => {
    toggleOmnibarOverlayMock.mockResolvedValue({
      state: "ready",
      overlayId: "o1",
      created: false,
      anchorTabId: 42,
    });
    const order: string[] = [];
    const warmSnapshot = vi.fn(() => order.push("warm"));
    Object.assign(globalThis, {
      browser: {
        runtime: {
          getURL: (path: string) => `moz-extension://test${path}`,
          sendMessage: vi.fn(async () => {
            order.push("remount");
            return true;
          }),
        },
      },
    });

    await toggleOmnibar(20, { warmSnapshot });

    expect(warmSnapshot).toHaveBeenCalledWith(42);
    expect(order).toEqual(["warm", "remount"]);
    expect(vi.mocked(showOmnibarOverlay)).toHaveBeenCalledWith("o1");
    expect(sendTabMessageMock).not.toHaveBeenCalled();
  });

  it("does not warm a snapshot when the toggle hides the window-hosted omnibar", async () => {
    toggleOmnibarOverlayMock.mockResolvedValue({ state: "hidden", overlayId: "o1" });
    Object.assign(globalThis, {
      browser: { runtime: { getURL: (path: string) => `moz-extension://test${path}` } },
    });
    const warmSnapshot = vi.fn();

    await toggleOmnibar(20, { warmSnapshot });

    expect(warmSnapshot).not.toHaveBeenCalled();
  });
});
