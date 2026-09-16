import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { SearchApp } from "../ui/search/SearchApp";

const tab = {
  id: 1,
  title: "First tab",
  url: "https://example.com",
  favIconUrl: "",
  windowId: 1,
  active: true,
};

describe("SearchApp", () => {
  it("renders results and activates the selected tab with Enter", async () => {
    const sendMessage = vi.fn(async ({ type }: { type: string }) => {
      if (type === "getTabs") return [tab];
      if (type === "getSpaces" || type === "getTimers") return [];
      return undefined;
    });
    Object.assign(globalThis, { browser: { runtime: { sendMessage } } });
    const onClose = vi.fn();
    const root = document.createElement("div");
    document.body.appendChild(root);

    render(<SearchApp onClose={onClose} />, root);
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));

    root
      .querySelector<HTMLInputElement>(".zen-input")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "switchTab", tabId: 1, domId: undefined }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });
});
