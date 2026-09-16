import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { SearchApp } from "../ui/search/SearchApp";

const tabs = [
  {
    id: 1,
    title: "First tab",
    url: "https://example.com",
    favIconUrl: "",
    windowId: 1,
    active: true,
  },
  {
    id: 2,
    title: "Second tab",
    url: "https://example.org",
    favIconUrl: "",
    windowId: 1,
  },
];

function mountSearchApp(
  onClose = vi.fn(),
  snapshotTabs = tabs,
  layout: "popup" | "overlay" = "popup",
) {
  const sendMessage = vi.fn(async ({ type }: { type: string }) => {
    if (type === "getSnapshot") {
      return { tabs: snapshotTabs, spaces: [], timers: [] };
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
  render(<SearchApp onClose={onClose} layout={layout} />, root);
  return { root, onClose, sendMessage };
}

describe("SearchApp", () => {
  it("renders results and activates the selected tab with Enter", async () => {
    const { root, onClose, sendMessage } = mountSearchApp();
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));

    root
      .querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "switchTab", tabId: 1, domId: undefined }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });

  it("moves the selection with ArrowDown before activating", async () => {
    const { root, onClose, sendMessage } = mountSearchApp();
    await vi.waitFor(() => expect(root.textContent).toContain("Second tab"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("First tab"),
    );
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("Second tab"),
    );
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "switchTab", tabId: 2, domId: undefined }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });

  it("shows forge tabs in the overlay navigator and filters them", async () => {
    const forgeTabs = [
      {
        ...tabs[0],
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
        lastOpenedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      },
      {
        ...tabs[1],
        title: "MR: !7 - Improve filters",
        url: "https://gitlab.com/acme/project/-/merge_requests/7",
        lastOpenedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
      },
    ];
    const { root, onClose, sendMessage } = mountSearchApp(vi.fn(), forgeTabs, "overlay");

    await vi.waitFor(() => expect(root.textContent).toContain("Issues and requests"));
    expect(root.textContent).toContain("GitHub");
    expect(root.textContent).toContain("GitLab");
    expect(root.textContent).toContain("Issues");
    expect(root.textContent).toContain("PRs / MRs");
    expect(root.textContent).toContain("Issue #42");
    expect(root.textContent).not.toContain("Merge request #7");
    expect(root.querySelectorAll("[data-testid='zen-search-item']")).toHaveLength(0);
    await vi.waitFor(() => expect(root.textContent).toContain("Recent"));
    expect(root.querySelector("span[title^='Last opened:']")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("button[title='Change issue sorting']")?.click();
    await vi.waitFor(() => expect(root.textContent).toContain("Old"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "42";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain("Fix search"));
    expect(root.textContent).not.toContain("Improve filters");

    root.querySelector<HTMLButtonElement>("button[title*='github.com']")?.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "switchTab",
        tabId: 1,
        domId: undefined,
      }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });

  it("moves arrow navigation to the issue navigator when the query starts with # or !", async () => {
    const mixedTabs = [
      {
        ...tabs[0],
        title: "Docs",
        url: "https://example.com/#intro",
      },
      {
        id: 3,
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      },
      {
        id: 4,
        title: "MR: !7 - Improve filters",
        url: "https://gitlab.com/acme/project/-/merge_requests/7",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
      },
    ];
    const { root, onClose, sendMessage } = mountSearchApp(vi.fn(), mixedTabs, "overlay");

    await vi.waitFor(() => expect(root.textContent).toContain("Docs"));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("Docs"),
    );

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "#";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.querySelector("[data-issue-selected='true']")?.textContent).toContain(
        "Fix search",
      ),
    );
    expect(root.querySelector("[data-selected='true']")).toBeNull();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("Docs"),
    );
    expect(root.querySelector("[data-issue-selected='true']")).toBeNull();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-issue-selected='true']")?.textContent).toContain(
        "Fix search",
      ),
    );

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-issue-selected='true']")?.textContent).toContain(
        "Improve filters",
      ),
    );
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "switchTab",
        tabId: 4,
        domId: undefined,
      }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });
});
