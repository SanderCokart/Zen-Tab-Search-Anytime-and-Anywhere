import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { TimerPopup } from "@/features/timers/ui/TimerPopup";

function mountTimerPopup(onClose = vi.fn()) {
  const sendMessage = vi.fn(async ({ type }: { type: string }) => {
    if (type === "getTab") {
      return {
        id: 1,
        title: "Timed tab",
        url: "https://example.com",
        favIconUrl: "",
        windowId: 1,
        active: true,
      };
    }
    if (type === "getSnapshot") {
      return { tabs: [], spaces: [], timers: [] };
    }
    return undefined;
  });
  Object.assign(globalThis, {
    browser: {
      runtime: {
        sendMessage,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    },
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(<TimerPopup tabId={1} onClose={onClose} />, root);
  return { root, onClose };
}

describe("TimerPopup", () => {
  it("closes on Escape even when the timer field is focused", async () => {
    const { root, onClose } = mountTimerPopup();
    await vi.waitFor(() => expect(root.textContent).toContain("Timed tab"));

    const input = root.querySelector<HTMLInputElement>("input[type='text']")!;
    input.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    render(null, root);
    root.remove();
  });
});
