import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { TimerForm } from "@/ui/timers/TimerForm";

function mountTimerForm(onSet = vi.fn(), onClear = vi.fn()) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(
    <TimerForm
      timer={{ tabId: 1, endAt: Date.now() + 60_000, originalLabel: "", title: "Tab" }}
      onSet={onSet}
      onClear={onClear}
    />,
    root,
  );
  return { root, onSet, onClear };
}

describe("TimerForm", () => {
  it("applies a preset and submits the parsed end time", async () => {
    const { root, onSet } = mountTimerForm();
    const preset = [...root.querySelectorAll("button")].find(
      (button) => button.textContent === "30 minutes",
    );
    expect(preset).toBeTruthy();
    preset!.click();

    root
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(onSet).toHaveBeenCalledTimes(1));
    const endAt = onSet.mock.calls[0][0] as number;
    expect(endAt).toBeGreaterThan(Date.now());
    expect(endAt).toBeLessThanOrEqual(Date.now() + 31 * 60_000);

    render(null, root);
    root.remove();
  });

  it("shows a parse hint for invalid natural language and clears an existing timer", async () => {
    const { root, onClear } = mountTimerForm();
    const input = root.querySelector<HTMLInputElement>("input[type='text']")!;
    input.value = "sometime maybe";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("Use a time like “tomorrow at 9am” or “1d 30m”."),
    );

    const clear = [...root.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear",
    );
    expect(clear).toBeTruthy();
    clear!.click();
    expect(onClear).toHaveBeenCalledTimes(1);

    render(null, root);
    root.remove();
  });
});
