import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { SearchApp } from "@/features/search/ui/SearchApp";

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
  displaySettings?: Record<string, unknown>,
  snapshotSpaces: Array<{ id: string; name: string; isActive: boolean }> = [],
) {
  const sendMessage = vi.fn(async ({ type }: { type: string }) => {
    if (type === "getSnapshot") {
      return { tabs: snapshotTabs, spaces: snapshotSpaces, timers: [] };
    }
    return undefined;
  });
  Object.assign(globalThis, {
    browser: {
      runtime: {
        sendMessage,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn(async () => (displaySettings ? { displaySettings } : {})),
          set: vi.fn(async () => undefined),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
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

  it("selects an exact whole-word match when the query changes", async () => {
    const { root } = mountSearchApp(vi.fn(), [
      { ...tabs[0], title: "Epic browser tab" },
      { ...tabs[1], title: "Ephemeral notes" },
    ]);
    await vi.waitFor(() => expect(root.textContent).toContain("Epic browser tab"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "Epic";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain(
        "Epic browser tab",
      ),
    );

    render(null, root);
    root.remove();
  });

  it("opens display settings directly from the gear button", async () => {
    const { root, sendMessage } = mountSearchApp();
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));

    root.querySelector<HTMLButtonElement>("button[title='Open display settings']")?.click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: "openSettings" }));

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

  it("keeps spaces and essential tabs above the current folder tab", async () => {
    const mixedTabs = [
      {
        ...tabs[0],
        folderId: "folder-a",
        folderName: "Projects",
        active: true,
      },
      {
        ...tabs[1],
        essential: true,
        title: "Pinned mail",
      },
    ];
    const { root } = mountSearchApp(vi.fn(), mixedTabs, "popup", undefined, [
      { id: "space-a", name: "Work", isActive: true },
    ]);

    await vi.waitFor(() => expect(root.textContent).toContain("Projects"));
    const sectionOrder = [...root.querySelectorAll("[data-testid]")].flatMap((node) => {
      const testId = node.getAttribute("data-testid");
      return testId === "zen-space-section" ||
        testId === "zen-essential-section" ||
        testId === "zen-folder-section"
        ? [testId]
        : [];
    });
    expect(sectionOrder).toEqual([
      "zen-space-section",
      "zen-essential-section",
      "zen-folder-section",
    ]);
    expect(root.querySelector("[data-selected='true']")?.textContent).toContain("First tab");

    render(null, root);
    root.remove();
  });

  it("groups tabs under their Zen folder headings", async () => {
    const folderTabs = [
      { ...tabs[0], folderId: "folder-a", folderName: "Projects" },
      { ...tabs[1], folderId: "folder-a", folderName: "Projects" },
    ];
    const { root } = mountSearchApp(vi.fn(), folderTabs);

    await vi.waitFor(() => expect(root.textContent).toContain("Projects"));
    expect(root.querySelectorAll("[data-testid='zen-folder-group']")).toHaveLength(1);
    expect(root.querySelectorAll("[data-testid='zen-search-item']")).toHaveLength(2);

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
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("3/2");
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

  it("keeps forge tabs in overlay results when issue detection is off", async () => {
    const forgeTabs = [
      {
        ...tabs[0],
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
      },
      {
        ...tabs[1],
        title: "Docs",
        url: "https://example.com",
      },
    ];
    const { root } = mountSearchApp(vi.fn(), forgeTabs, "overlay", {
      detectForgeIssues: false,
      filterIssuesInOverlay: true,
    });

    await vi.waitFor(() => expect(root.textContent).toContain("Fix search"));
    expect(root.textContent).not.toContain("Issues and requests");
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("1/1");
    expect(root.querySelectorAll("[data-testid='zen-search-item']")).toHaveLength(2);

    render(null, root);
    root.remove();
  });

  it("shows forge tabs in both overlay results and the issue navigator when the nested filter is off", async () => {
    const forgeTabs = [
      {
        ...tabs[0],
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
      },
    ];
    const { root } = mountSearchApp(vi.fn(), forgeTabs, "overlay", {
      detectForgeIssues: true,
      filterIssuesInOverlay: false,
    });

    await vi.waitFor(() => expect(root.textContent).toContain("Issues and requests"));
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("3/2");
    expect(root.querySelectorAll("[data-testid='zen-search-item']")).toHaveLength(1);
    expect(root.textContent).toContain("Fix search");

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

  it("prefers a direct issue match over a direct normal-tab match", async () => {
    const mixedTabs = [
      {
        ...tabs[0],
        title: "Fix search notes",
        url: "https://example.com/fix-search",
      },
      {
        id: 3,
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
        favIconUrl: "",
        windowId: 1,
      },
    ];
    const { root } = mountSearchApp(vi.fn(), mixedTabs, "overlay");
    await vi.waitFor(() => expect(root.textContent).toContain("Fix search notes"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "Fix search";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.querySelector("[data-issue-selected='true']")?.textContent).toContain(
        "Fix search",
      ),
    );
    expect(root.querySelector("[data-selected='true']")).toBeNull();

    render(null, root);
    root.remove();
  });

  it("selects a GitLab issue whose visible name is EPIC", async () => {
    const mixedTabs = [
      {
        ...tabs[0],
        title: "Handbook",
        url: "https://example.com/docs",
        folderName: "Docs",
        workspaceName: "Work",
      },
      {
        id: 3,
        title: "EPIC",
        url: "https://gitlab.com/acme/project/-/issues/42",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: Date.now() - 2 * 60 * 60 * 1000,
      },
      {
        id: 4,
        title: "ISSUE: #7 - Dark mode sidebar toggle",
        url: "https://gitlab.com/acme/project/-/issues/7",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: Date.now() - 24 * 60 * 60 * 1000,
      },
    ];
    const { root } = mountSearchApp(vi.fn(), mixedTabs, "overlay");
    await vi.waitFor(() => expect(root.textContent).toContain("Handbook"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    for (const value of ["E", "EP", "EPI", "EPIC"]) {
      input.value = value;
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    await vi.waitFor(() =>
      expect(root.querySelector("[data-issue-selected='true']")?.textContent).toMatch(/EPIC/),
    );
    expect(root.querySelector("[data-selected='true']")).toBeNull();

    render(null, root);
    root.remove();
  });

  it("selects an exact issue name even when a more recent issue is listed first", async () => {
    const mixedTabs = [
      {
        ...tabs[0],
        title: "Notes",
        url: "https://example.com/notes",
      },
      {
        id: 3,
        title: "Unrelated GitHub title · Issue #10 · acme/project",
        customLabel: "Epic",
        url: "https://github.com/acme/project/issues/10",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: 100,
      },
      {
        id: 4,
        title: "Newer issue · Issue #2 · acme/project",
        url: "https://github.com/acme/project/issues/2",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: 500,
      },
    ];
    const { root } = mountSearchApp(vi.fn(), mixedTabs, "overlay");
    await vi.waitFor(() => expect(root.textContent).toContain("Notes"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "Epic";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.querySelector("[data-issue-selected='true']")?.textContent).toContain("Epic"),
    );
    expect(root.querySelector("[data-issue-selected='true']")?.textContent).not.toContain(
      "Newer issue",
    );
    expect(root.querySelector("[data-selected='true']")).toBeNull();

    render(null, root);
    root.remove();
  });

  it("selects the issue with the most matching words", async () => {
    const mixedTabs = [
      {
        ...tabs[0],
        title: "Notes",
        url: "https://example.com/notes",
      },
      {
        id: 3,
        title: "Compact layout",
        url: "https://github.com/acme/project/issues/1",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: 500,
      },
      {
        id: 4,
        title: "Dark mode sidebar toggle",
        url: "https://github.com/acme/project/issues/2",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: 100,
      },
    ];
    const { root } = mountSearchApp(vi.fn(), mixedTabs, "overlay");
    await vi.waitFor(() => expect(root.textContent).toContain("Notes"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "dark mode sidebar";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.querySelector("[data-issue-selected='true']")?.textContent).toContain(
        "Dark mode sidebar toggle",
      ),
    );
    expect(root.querySelector("[data-issue-selected='true']")?.textContent).not.toContain(
      "Compact layout",
    );
    expect(root.querySelector("[data-selected='true']")).toBeNull();

    render(null, root);
    root.remove();
  });

  it("renames a normal tab from the context menu", async () => {
    const { root, sendMessage } = mountSearchApp();
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));

    root
      .querySelector("[data-testid='zen-search-item']")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 20 }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-tab-context-menu']")?.textContent).toContain(
        "Rename",
      ),
    );
    [...root.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Rename"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => expect(root.querySelector("form")?.textContent).toContain("Rename tab"));
    const input = root.querySelector("form input") as HTMLInputElement;
    input.value = "Docs";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(input.value).toBe("Docs"));
    root.querySelector<HTMLButtonElement>("form button[type='submit']")!.click();

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "setTabLabel", tabId: 1, label: "Docs" }),
    );

    render(null, root);
    root.remove();
  });

  it("renames an essential tab from the context menu", async () => {
    const { root } = mountSearchApp(vi.fn(), [
      {
        ...tabs[0],
        essential: true,
        domId: "essential-1",
        title: "Pinned mail",
      },
    ]);
    await vi.waitFor(() => expect(root.textContent).toContain("Pinned mail"));

    root
      .querySelector("[data-testid='zen-search-item']")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 20 }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-tab-context-menu']")?.textContent).toContain(
        "Rename",
      ),
    );
    [...root.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Rename"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => expect(root.querySelector("form")?.textContent).toContain("Rename tab"));
    const input = root.querySelector("form input") as HTMLInputElement;
    input.value = "Inbox";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(input.value).toBe("Inbox"));
    root.querySelector<HTMLButtonElement>("form button[type='submit']")!.click();

    await vi.waitFor(() =>
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        essentialTabNames: { "essential-1": "Inbox" },
      }),
    );

    render(null, root);
    root.remove();
  });
});
