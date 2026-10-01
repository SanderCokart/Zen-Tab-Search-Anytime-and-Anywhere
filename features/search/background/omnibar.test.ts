import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleOmnibar } from "@/features/search/background/omnibar";
import { toggleSearchPopup } from "@/features/search/background/popup";
import { sendTabMessage } from "@/shared/messaging/client";
import { resolveAnchorTabId } from "@/features/zen/anchor";

vi.mock("@/shared/messaging/client", () => ({
  sendTabMessage: vi.fn(async () => undefined),
}));

vi.mock("@/features/search/background/popup", () => ({
  toggleSearchPopup: vi.fn(async () => undefined),
}));

vi.mock("@/features/zen/anchor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/zen/anchor")>();
  return {
    ...actual,
    resolveAnchorTabId: vi.fn(actual.resolveAnchorTabId),
  };
});

const sendTabMessageMock = vi.mocked(sendTabMessage);
const toggleSearchPopupMock = vi.mocked(toggleSearchPopup);
const resolveAnchorTabIdMock = vi.mocked(resolveAnchorTabId);

describe("toggleOmnibar", () => {
  afterEach(() => {
    sendTabMessageMock.mockReset();
    toggleSearchPopupMock.mockReset();
    resolveAnchorTabIdMock.mockReset();
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
    expect(toggleSearchPopupMock).not.toHaveBeenCalled();
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
});
