import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import { applyPreset, matchPreset } from "@/features/settings/model/complexity";
import { ComplexitySettings } from "@/features/settings/ui/ComplexitySettings";

function mount(settings = { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") }) {
  const onChange = vi.fn();
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(<ComplexitySettings settings={settings} onChange={onChange} />, root);
  return {
    root,
    onChange,
    unmount: () => {
      render(null, root);
      root.remove();
    },
  };
}

describe("ComplexitySettings", () => {
  it("applies Pro when the slider moves to that preset", () => {
    const { root, onChange, unmount } = mount();
    const slider = root.querySelector<HTMLInputElement>("[data-testid='zen-complexity-preset']")!;
    expect(slider.value).toBe("0");
    expect(slider.max).toBe("3");
    slider.value = "2";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(applyPreset("pro"));
    unmount();
  });

  it("keeps Custom on the LCD without adding a stop past Dev", () => {
    const simple = { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") };
    const { root, onChange, unmount } = mount(simple);
    root.querySelector<HTMLInputElement>("[data-testid='zen-complexity-timers']")!.click();
    const flags = onChange.mock.calls[0]?.[0];
    unmount();

    const custom = { ...simple, ...flags };
    const shown = mount(custom);
    const slider = shown.root.querySelector<HTMLInputElement>(
      "[data-testid='zen-complexity-preset']",
    )!;
    expect(slider.max).toBe("3");
    expect(slider.value).toBe("0");
    expect(shown.root.textContent).toContain("Custom");
    shown.unmount();
  });

  it("becomes Custom after a checkbox that is not on the preset", () => {
    const simple = { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") };
    const { root, onChange, unmount } = mount(simple);
    root.querySelector<HTMLInputElement>("[data-testid='zen-complexity-timers']")!.click();
    const flags = onChange.mock.calls[0]?.[0];
    expect(flags?.timers).toBe(true);
    expect(flags?.fullscreen).toBe(false);
    expect(matchPreset({ ...simple, ...flags })).toBe("custom");
    unmount();
  });

  it("turns fullscreen on when todos are checked from Spotlight", () => {
    const simple = { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("simple") };
    const { root, onChange, unmount } = mount(simple);
    root.querySelector<HTMLInputElement>("[data-testid='zen-complexity-todos']")!.click();
    const flags = onChange.mock.calls[0]?.[0];
    expect(flags?.todos).toBe(true);
    expect(flags?.fullscreen).toBe(true);
    unmount();
  });
});
