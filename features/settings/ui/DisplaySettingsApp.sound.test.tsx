import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import { DisplaySettingsApp } from "@/features/settings/ui/DisplaySettingsApp";
import { resetSharedSoundEngine } from "@/shared/ui/sound/SoundContext";

const { play, setVolume } = vi.hoisted(() => ({ play: vi.fn(), setVolume: vi.fn() }));

vi.mock("@/shared/ui/sound/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/ui/sound/engine")>()),
  createSoundEngine: () => ({ play, setVolume }),
}));

let root: HTMLDivElement;
let set: ReturnType<typeof vi.fn>;

async function mount(stored: Record<string, unknown> = {}) {
  set = vi.fn(async () => undefined);
  Object.assign(globalThis, {
    browser: {
      storage: {
        local: { get: vi.fn(async () => ({ displaySettings: stored })), set },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    },
  });
  root = document.createElement("div");
  document.body.appendChild(root);
  render(<DisplaySettingsApp />, root);
  await vi.waitFor(() => {
    expect(
      root.querySelector<HTMLInputElement>("[data-testid='zen-truncateTabTitles']")?.disabled,
    ).toBe(false);
  });
}

const byId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid='${id}']`)!;

function input(slider: HTMLInputElement, value: string) {
  slider.value = value;
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  play.mockClear();
  setVolume.mockClear();
  resetSharedSoundEngine();
});

afterEach(() => {
  render(null, root);
  root.remove();
});

describe("switches", () => {
  it("are accessible switches that report their state", async () => {
    await mount({ reuseExternalTabs: false });
    const reuse = byId<HTMLInputElement>("zen-reuseExternalTabs");
    expect(reuse.getAttribute("role")).toBe("switch");
    expect(reuse.checked).toBe(false);
    expect(root.querySelectorAll("input[type='checkbox']:not([role='switch'])")).toHaveLength(0);

    reuse.click();
    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: { ...DEFAULT_DISPLAY_SETTINGS, reuseExternalTabs: true },
      }),
    );
    expect(byId<HTMLInputElement>("zen-reuseExternalTabs").checked).toBe(true);
  });

  it("toggle from their label", async () => {
    await mount({});
    const label = byId("zen-hideSpacesInOverlay").closest("label")!;
    label.click();
    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: { ...DEFAULT_DISPLAY_SETTINGS, hideSpacesInOverlay: true },
      }),
    );
  });

  it("latch down when turned on and up when turned off", async () => {
    await mount({ reuseExternalTabs: false });
    byId("zen-reuseExternalTabs").click();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("latch-down"));
    byId("zen-reuseExternalTabs").click();
    await vi.waitFor(() => expect(play).toHaveBeenLastCalledWith("latch-up"));
  });
});

describe("gap settings", () => {
  it("lists the gaps in the order the omnibar lays them out, beside the ratio dial", async () => {
    await mount();
    const order = [...root.querySelectorAll<HTMLElement>("[data-testid$='Gap']")].map(
      (slider) => slider.getAttribute("data-testid"),
    );
    expect(order).toEqual([
      "zen-spaceGap",
      "zen-essentialGap",
      "zen-tabGap",
      "zen-sectionGap",
      "zen-folderGap",
      "zen-issueGap",
      "zen-todoGap",
    ]);
    expect(root.textContent).toContain("Issues and requests");
    expect(byId("zen-gapPaddingRatio")).not.toBeNull();
    expect(root.textContent).toContain("1:1");
  });
});

describe("sound on the settings page", () => {
  it("ticks once for each step a slider moves, not for a move inside a step", async () => {
    await mount({ soundEnabled: true });
    const gap = byId<HTMLInputElement>("zen-tabGap");
    input(gap, "8");
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("tick"));
    expect(play).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenLastCalledWith({
      displaySettings: { ...DEFAULT_DISPLAY_SETTINGS, tabGap: 8 },
    });

    // 8.4 snaps back onto the step it is already on.
    input(byId<HTMLInputElement>("zen-tabGap"), "8.4");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("ticks for the font size and density sliders", async () => {
    await mount({ soundEnabled: true });
    input(byId<HTMLInputElement>("zen-fontSize"), "16");
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    input(byId<HTMLInputElement>("zen-uiScale"), "1.1");
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(play).toHaveBeenCalledWith("tick");
  });

  it("is silent with sound off", async () => {
    await mount({ soundEnabled: false });
    byId("zen-reuseExternalTabs").click();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    input(byId<HTMLInputElement>("zen-tabGap"), "12");
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    byId("zen-hideSpacesInOverlay").click();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(3));
    expect(set).toHaveBeenLastCalledWith({
      displaySettings: expect.objectContaining({
        hideSpacesInOverlay: true,
        tabGap: 12,
        reuseExternalTabs: true,
      }),
    });
    expect(play).not.toHaveBeenCalled();
  });

  it("plays key presses down and up, but not for the test keys", async () => {
    await mount({ soundEnabled: true });
    const reset = [...root.querySelectorAll<HTMLButtonElement>("button.zs-key")].find((button) =>
      button.textContent?.includes("Reset sizes"),
    )!;
    // Defaults leave Reset sizes disabled, so use the red Done key.
    expect(reset.disabled).toBe(true);
    const done = [...root.querySelectorAll<HTMLButtonElement>("button.zs-key-red")].find(
      (button) => button.textContent === "Done",
    )!;
    done.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    done.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(play).toHaveBeenNthCalledWith(1, "down-primary");
    expect(play).toHaveBeenNthCalledWith(2, "up");

    play.mockClear();
    const click = byId<HTMLButtonElement>("zen-sound-test-click");
    click.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    click.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(play).not.toHaveBeenCalled();
  });

  it("plays each test key's voice at the current volume", async () => {
    await mount({ soundEnabled: true, soundVolume: 0.7 });
    await vi.waitFor(() => expect(setVolume).toHaveBeenLastCalledWith(0.7));
    byId("zen-sound-test-click").click();
    byId("zen-sound-test-tick").click();
    byId("zen-sound-test-chime").click();
    expect(play.mock.calls.map(([voice]) => voice)).toEqual(["down", "tick", "success"]);
  });

  it("turns the volume up from the keyboard and ticks", async () => {
    await mount({ soundEnabled: true, soundVolume: 0.4 });
    const dial = byId("zen-sound-volume");
    expect(dial.getAttribute("role")).toBe("slider");
    expect(dial.getAttribute("aria-valuemin")).toBe("0");
    expect(dial.getAttribute("aria-valuemax")).toBe("1");
    expect(dial.getAttribute("aria-valuenow")).toBe("0.4");

    dial.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await vi.waitFor(() =>
      expect(set).toHaveBeenLastCalledWith({
        displaySettings: { ...DEFAULT_DISPLAY_SETTINGS, soundVolume: 0.45 },
      }),
    );
    expect(play).toHaveBeenCalledWith("tick");
    await vi.waitFor(() =>
      expect(byId("zen-sound-volume").getAttribute("aria-valuenow")).toBe("0.45"),
    );

    byId("zen-sound-volume").dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(byId("zen-sound-volume").getAttribute("aria-valuenow")).toBe("1"),
    );
    byId("zen-sound-volume").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(byId("zen-sound-volume").getAttribute("aria-valuenow")).toBe("0"),
    );
  });

  it("hides the pointer while the dial turns and reads vertical movement", async () => {
    await mount({ soundEnabled: true, soundVolume: 0.4 });
    const dial = byId("zen-sound-volume");
    const pointer = (type: string, clientY: number) => {
      dial.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientY }));
    };

    pointer("pointerdown", 100);
    expect(dial.hasAttribute("data-turning")).toBe(true);

    pointer("pointermove", 40);
    await vi.waitFor(() =>
      expect(Number(byId("zen-sound-volume").getAttribute("aria-valuenow"))).toBeGreaterThan(0.4),
    );

    pointer("pointerup", 40);
    expect(byId("zen-sound-volume").hasAttribute("data-turning")).toBe(false);
  });

  it("leaves the dial and test keys off while interface sounds are off", async () => {
    await mount({ soundEnabled: false });
    expect(byId("zen-sound-volume").getAttribute("aria-disabled")).toBe("true");
    expect(byId<HTMLButtonElement>("zen-sound-test-tick").disabled).toBe(true);
    byId("zen-sound-volume").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(set).not.toHaveBeenCalled();
  });
});
