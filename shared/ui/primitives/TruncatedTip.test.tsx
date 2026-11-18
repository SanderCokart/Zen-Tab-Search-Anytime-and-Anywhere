import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TruncatedTip } from "@/shared/ui/primitives/Tooltip";

function mount(truncate: boolean, overflow: boolean) {
  const root = document.createElement("div");
  root.setAttribute("data-zen-ui", "");
  document.body.append(root);
  render(<TruncatedTip text="A very long tab title" truncate={truncate} />, root);
  const span = root.querySelector("span")!;
  // jsdom has no layout; stand in for a title that does or does not overflow.
  Object.defineProperty(span, "clientWidth", { configurable: true, value: 100 });
  Object.defineProperty(span, "scrollWidth", { configurable: true, value: overflow ? 240 : 100 });
  return { root, span };
}

describe("TruncatedTip", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("shows the full title after a pause while it is cut off", async () => {
    vi.useFakeTimers();
    const { root, span } = mount(true, true);

    span.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.runAllTimersAsync();

    expect(root.querySelector("[role='tooltip']")?.textContent).toBe("A very long tab title");
  });

  it("shows nothing when the title fits", async () => {
    vi.useFakeTimers();
    const { root, span } = mount(true, false);

    span.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.runAllTimersAsync();

    expect(root.querySelector("[role='tooltip']")).toBeNull();
  });

  it("shows nothing with truncation off, since the title wraps", async () => {
    vi.useFakeTimers();
    const { root, span } = mount(false, true);

    span.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.runAllTimersAsync();

    expect(root.querySelector("[role='tooltip']")).toBeNull();
  });
});
