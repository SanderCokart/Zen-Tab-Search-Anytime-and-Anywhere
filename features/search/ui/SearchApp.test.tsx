import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { SearchApp } from "@/features/search/ui/SearchApp";
import type { SpaceInfo, TabInfo, TabStatus, TabTodo } from "@/shared/types";

const tabs: TabInfo[] = [
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
  // Tests supply partial tabs; the component receives them through the mocked
  // getSnapshot response exactly as the background script would send them.
  snapshotTabs: Partial<TabInfo>[] = tabs,
  layout: "popup" | "overlay" = "popup",
  displaySettings?: Record<string, unknown>,
  snapshotSpaces: Partial<SpaceInfo>[] = [],
  snapshotTodos: TabTodo[] = [],
  snapshotStatuses: TabStatus[] = [],
) {
  const sendMessage = vi.fn(async ({ type }: { type: string }) => {
    if (type === "getSnapshot") {
      return {
        tabs: snapshotTabs,
        spaces: snapshotSpaces,
        timers: [],
        todos: snapshotTodos,
        statuses: snapshotStatuses,
      };
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

  it("puts the host overrides button between the timer and settings buttons", async () => {
    const { root, sendMessage } = mountSearchApp();
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));

    const timer = root.querySelector("button[title='Show active timers']")!;
    const hosts = root.querySelector<HTMLButtonElement>(
      "button[title='Host overrides for this tab']",
    )!;
    const settings = root.querySelector("button[title='Open display settings']")!;
    expect(timer.nextElementSibling).toBe(hosts);
    expect(hosts.nextElementSibling).toBe(settings);

    hosts.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "openHostOverridesPopup", tabId: 1 }),
    );

    render(null, root);
    root.remove();
  });

  it("swaps the overlay columns for a row's host overrides from its context menu", async () => {
    const { root, sendMessage } = mountSearchApp(vi.fn(), tabs, "overlay");
    const menu = () => root.querySelector("[data-testid='zen-tab-context-menu']");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-search-item']")).toBeTruthy(),
    );

    root.querySelector("[data-testid='zen-search-item']")!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Host overrides…"));
    [...menu()!.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((item) => item.textContent?.includes("Host overrides"))!
      .click();

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "getHostOverrides", tabId: 1 }),
    );
    expect(sendMessage).not.toHaveBeenCalledWith({ type: "openHostOverridesPopup", tabId: 1 });
    expect(menu()).toBeNull();
    expect(root.querySelector("h1")?.textContent).toBe("Host overrides");

    [...root.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Back to search"))!
      .click();
    await vi.waitFor(() => expect(root.querySelector("h1")).toBeNull());

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

  it("hides spaces and essential tabs on one surface only", async () => {
    const mixedTabs = [
      { ...tabs[0], title: "Regular tab", active: true },
      { ...tabs[1], essential: true, title: "Pinned mail" },
    ];
    const spaces = [{ id: "space-a", name: "Work", isActive: false }];
    const settings = {
      hideSpacesInPopup: true,
      hideEssentialsInPopup: true,
    };

    const popup = mountSearchApp(vi.fn(), mixedTabs, "popup", settings, spaces);
    await vi.waitFor(() => expect(popup.root.textContent).toContain("Regular tab"));
    expect(popup.root.textContent).not.toContain("Pinned mail");
    expect(popup.root.textContent).not.toContain("Work");
    expect(popup.root.querySelector("[data-testid='zen-space-section']")).toBeNull();
    expect(popup.root.querySelector("[data-testid='zen-essential-section']")).toBeNull();

    const input = popup.root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "Pinned";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(popup.root.textContent).not.toContain("Pinned mail"));

    render(null, popup.root);
    popup.root.remove();

    const overlay = mountSearchApp(vi.fn(), mixedTabs, "overlay", settings, spaces);
    await vi.waitFor(() => expect(overlay.root.textContent).toContain("Pinned mail"));
    expect(overlay.root.textContent).toContain("Work");
    expect(overlay.root.querySelector("[data-testid='zen-space-section']")).toBeTruthy();
    expect(overlay.root.querySelector("[data-testid='zen-essential-section']")).toBeTruthy();

    render(null, overlay.root);
    overlay.root.remove();
  });

  it("hides omnibar spaces without hiding essential tabs", async () => {
    const mixedTabs = [
      { ...tabs[0], title: "Regular tab", active: true },
      { ...tabs[1], essential: true, title: "Pinned mail" },
    ];
    const { root } = mountSearchApp(vi.fn(), mixedTabs, "overlay", { hideSpacesInOverlay: true }, [
      { id: "space-a", name: "Work", isActive: false },
    ]);

    await vi.waitFor(() => expect(root.textContent).toContain("Pinned mail"));
    expect(root.textContent).toContain("Regular tab");
    expect(root.textContent).not.toContain("Work");
    expect(root.querySelector("[data-testid='zen-essential-section']")).toBeTruthy();
    expect(root.querySelector("[data-testid='zen-space-section']")).toBeNull();

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
    // Neither is current, so no entry is pinned above the provider groups.
    const forgeTabs = [
      {
        ...tabs[0],
        active: false,
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
    // Tabs and issues; the todo column stays hidden with no todos.
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
    await vi.waitFor(() => {
      expect(root.textContent).toContain("Fix search");
      expect(root.textContent).not.toContain("Improve filters");
    });

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

  it("keeps a square overlay when issue detection is on but no issues are open", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", { detectForgeIssues: true });

    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("1/1");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-omnibar-stage]")?.getAttribute("data-omnibar-stage")).toBe(
        "open",
      ),
    );

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
    // Only the tab column: no issue column, and no todo column without todos.
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("1/1");
    expect(root.querySelector("[data-testid='zen-todo-column']")).toBeNull();
    expect(root.querySelectorAll("[data-testid='zen-search-item']")).toHaveLength(2);

    render(null, root);
    root.remove();
  });

  it("lists marked tabs in the todo column", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      { detectForgeIssues: false },
      [],
      [{ tabId: 2, status: "todo" }],
    );

    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).toContain(
        "Second tab",
      ),
    );
    const column = root.querySelector("[data-testid='zen-todo-column']")!;
    expect(column.textContent).toContain("1 to do");
    expect(column.textContent).not.toContain("First tab");
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("3/2");

    render(null, root);
    root.remove();
  });

  it("moves arrow navigation to the todo column with Tab, then activates with Enter", async () => {
    // No tab is current here, so the tab list keeps the keyboard until Tab.
    const { root, onClose, sendMessage } = mountSearchApp(
      vi.fn(),
      tabs.map((tab) => ({ ...tab, active: false })),
      "overlay",
      undefined,
      [],
      [
        { tabId: 1, status: "todo" },
        { tabId: 2, status: "todo" },
      ],
    );

    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).toContain(
        "First tab",
      ),
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("First tab"),
    );

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-todo-selected='true']")?.textContent).toContain("First tab"),
    );
    expect(root.querySelector("[data-selected='true']")).toBeNull();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-todo-selected='true']")?.textContent).toContain(
        "Second tab",
      ),
    );
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "switchTab",
        tabId: 2,
        domId: undefined,
      }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });

  it("toggles a todo from a row's todo button, and marking it done removes it", async () => {
    const { root, sendMessage } = mountSearchApp(vi.fn(), tabs, "overlay");

    await vi.waitFor(() =>
      expect(root.querySelectorAll("[data-testid='zen-todo-button']").length).toBeGreaterThan(0),
    );
    const button = () => root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-button']")!;

    button().click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).toContain(
        "First tab",
      ),
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "setTodo", tabId: 1, status: "todo" });
    expect(root.querySelector("[data-testid='zen-tab-context-menu']")).toBeNull();
    expect(button().getAttribute("aria-label")).toBe("Mark as done");

    button().click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")).toBeNull(),
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "setTodo", tabId: 1, status: "none" });

    render(null, root);
    root.remove();
  });

  it("lists the current tab first in the todo column and highlights it there", async () => {
    const { root, onClose, sendMessage } = mountSearchApp(
      vi.fn(),
      [
        { ...tabs[1], active: false },
        { ...tabs[0], active: true },
      ],
      "overlay",
      undefined,
      [],
      [
        { tabId: 2, status: "todo" },
        { tabId: 1, status: "todo" },
      ],
    );
    const todoRows = () => [
      ...root.querySelectorAll("[data-testid='zen-todo-column'] .zen-scroll > div"),
    ];

    await vi.waitFor(() =>
      expect(root.querySelector("[data-todo-selected='true']")?.textContent).toContain("First tab"),
    );
    expect(todoRows()[0]?.textContent).toContain("First tab");
    expect(todoRows()[0]?.textContent).toContain("Current tab");
    expect(todoRows()[1]?.textContent).toContain("Second tab");
    // The todo column has the keyboard, so nothing in the tab list is selected.
    expect(root.querySelector("[data-selected='true']")).toBeNull();

    // Typing hands the keyboard back to the search results.
    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "Second";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("Second tab"),
    );
    expect(root.querySelector("[data-todo-selected='true']")).toBeNull();

    input.value = "";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-todo-selected='true']")?.textContent).toContain("First tab"),
    );
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "switchTab", tabId: 1, domId: undefined }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });

  it("keeps the tab list highlighted when the current tab is not a todo", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [{ tabId: 2, status: "todo" }],
    );

    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("First tab"),
    );
    expect(root.querySelector("[data-todo-selected='true']")).toBeNull();

    render(null, root);
    root.remove();
  });

  it("shows an empty checkbox for a tab that is not a todo and a checked one for a todo", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-button']")).not.toBeNull(),
    );
    const button = () => root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-button']")!;

    // The empty checkbox has no cut-out tick; the checked one does.
    expect(button().querySelector("mask")).toBeNull();
    button().click();
    await vi.waitFor(() => expect(button().getAttribute("aria-pressed")).toBe("true"));
    expect(button().querySelector("mask")).not.toBeNull();

    render(null, root);
    root.remove();
  });

  it("shows a tooltip on the todo and timer buttons", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-button']")).not.toBeNull(),
    );

    root
      .querySelector("[data-testid='zen-todo-button']")!
      .dispatchEvent(new MouseEvent("mouseenter"));
    await vi.waitFor(() =>
      expect(root.querySelector("[role='tooltip']")?.textContent).toBe("Mark as todo"),
    );
    root
      .querySelector("[data-testid='zen-todo-button']")!
      .dispatchEvent(new MouseEvent("mouseleave"));
    await vi.waitFor(() => expect(root.querySelector("[role='tooltip']")).toBeNull());

    root
      .querySelector("[data-testid='zen-timer-button']")!
      .dispatchEvent(new MouseEvent("mouseenter"));
    await vi.waitFor(() =>
      expect(root.querySelector("[role='tooltip']")?.textContent).toBe("Open timer controls"),
    );

    render(null, root);
    root.remove();
  });

  it("gives issue entries todo and timer buttons", async () => {
    const forgeTabs = [
      { ...tabs[0], title: "Fix search", url: "https://github.com/acme/project/issues/42" },
    ];
    const { root, sendMessage } = mountSearchApp(vi.fn(), forgeTabs, "overlay");

    const issue = () => root.querySelector("[data-testid='zen-issue-entry']");
    await vi.waitFor(() => expect(issue()).toBeTruthy());
    expect(issue()!.querySelector("[data-testid='zen-timer-button']")).not.toBeNull();

    issue()!.querySelector<HTMLButtonElement>("[data-testid='zen-todo-button']")!.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "setTodo", tabId: 1, status: "todo" }),
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).toContain(
        "Fix search",
      ),
    );

    issue()!.querySelector<HTMLButtonElement>("[data-testid='zen-timer-button']")!.click();
    await vi.waitFor(() => expect(issue()!.querySelector("form")).not.toBeNull());
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "switchTab" }));

    render(null, root);
    root.remove();
  });

  it("sets a status color on a tab row from its status button, without making it a todo", async () => {
    const { root, sendMessage } = mountSearchApp(vi.fn(), tabs, "overlay");
    const row = () => root.querySelector("[data-testid='zen-search-item']")!;
    const statusButton = () =>
      row().querySelector<HTMLButtonElement>("[data-testid='zen-status-button']");
    const menu = () => root.querySelector("[data-testid='zen-traffic-light-menu']");

    await vi.waitFor(() => expect(statusButton()).toBeTruthy());
    expect(row().getAttribute("data-status-light")).toBeNull();

    statusButton()!.click();
    await vi.waitFor(() => expect(menu()).not.toBeNull());
    expect(statusButton()!.getAttribute("aria-expanded")).toBe("true");
    expect(
      [...menu()!.querySelectorAll("[role='menuitemradio']")].map((item) => item.textContent),
    ).toEqual(["Red", "Orange", "Green"]);

    menu()!.querySelector<HTMLButtonElement>("[data-traffic-light='orange']")!.click();
    await vi.waitFor(() => expect(menu()).toBeNull());
    expect(sendMessage).toHaveBeenCalledWith({ type: "setTabStatus", tabId: 1, light: "orange" });
    await vi.waitFor(() => expect(row().getAttribute("data-status-light")).toBe("orange"));
    expect(row().className).toContain("bg-orange-500/");
    // A status color is independent of todos.
    expect(root.querySelector("[data-testid='zen-todo-column']")).toBeNull();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "setTodo" }));

    // Clearing it from the same dropdown removes the tint.
    statusButton()!.click();
    await vi.waitFor(() => expect(menu()).not.toBeNull());
    menu()!.querySelector<HTMLButtonElement>("[data-traffic-light='none']")!.click();
    await vi.waitFor(() => expect(row().getAttribute("data-status-light")).toBeNull());
    expect(sendMessage).toHaveBeenCalledWith({ type: "setTabStatus", tabId: 1, light: "none" });

    render(null, root);
    root.remove();
  });

  it("tints tab rows, issue entries and todo rows by their tab's status color", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      [
        { ...tabs[0], title: "Fix search", url: "https://github.com/acme/project/issues/42" },
        { ...tabs[1] },
      ],
      "overlay",
      { detectForgeIssues: true, filterIssuesInOverlay: false },
      [],
      [{ tabId: 2, status: "todo" }],
      [
        { tabId: 1, light: "red" },
        { tabId: 2, light: "green" },
      ],
    );

    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-testid='zen-issue-entry']")?.getAttribute("data-status-light"),
      ).toBe("red"),
    );
    const issue = root.querySelector("[data-testid='zen-issue-entry']")!;
    expect(issue.className).toContain("bg-red-500/");
    expect(issue.querySelector("[data-testid='zen-status-button']")).not.toBeNull();

    const todoRow = root.querySelector("[data-testid='zen-todo-column'] [data-status-light]")!;
    expect(todoRow.getAttribute("data-status-light")).toBe("green");
    expect(todoRow.className).toContain("bg-green-500/");

    const tabRows = [...root.querySelectorAll("[data-testid='zen-search-item']")];
    expect(
      tabRows
        .find((row) => row.textContent?.includes("Second tab"))
        ?.getAttribute("data-status-light"),
    ).toBe("green");

    render(null, root);
    root.remove();
  });

  it("clears the todos of one status color after confirming", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { root, sendMessage } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [
        { tabId: 1, status: "todo" },
        { tabId: 2, status: "todo" },
      ],
      [{ tabId: 2, light: "red" }],
    );
    const select = () => root.querySelector<HTMLSelectElement>("[data-testid='zen-todo-clear']")!;
    await vi.waitFor(() => expect(select()).toBeTruthy());
    expect([...select().options].map((option) => option.textContent)).toEqual([
      "Clear…",
      "All (2)",
      "Red (1)",
      "Orange (0)",
      "Green (0)",
    ]);

    select().value = "red";
    select().dispatchEvent(new Event("change", { bubbles: true }));

    expect(confirm).toHaveBeenCalledWith("Mark 1 todo with status red as done?");
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "clearTodos", tabIds: [2] }),
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).not.toContain(
        "Second tab",
      ),
    );

    confirm.mockRestore();
    render(null, root);
    root.remove();
  });

  it("keeps the todos when the clear confirmation is declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { root, sendMessage } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [{ tabId: 1, status: "todo" }],
    );
    const select = () => root.querySelector<HTMLSelectElement>("[data-testid='zen-todo-clear']")!;
    await vi.waitFor(() => expect(select()).toBeTruthy());

    select().value = "all";
    select().dispatchEvent(new Event("change", { bubbles: true }));

    expect(confirm).toHaveBeenCalledWith("Mark 1 todo as done?");
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "clearTodos" }));
    expect(select().value).toBe("");

    confirm.mockRestore();
    render(null, root);
    root.remove();
  });

  it("puts the status button to the right of Mark as done", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [{ tabId: 2, status: "todo" }],
    );
    const column = () => root.querySelector("[data-testid='zen-todo-column']");
    await vi.waitFor(() =>
      expect(column()?.querySelector("[data-testid='zen-status-button']")).toBeTruthy(),
    );

    const done = column()!.querySelector("[data-testid='zen-todo-done-button']")!;
    const status = column()!.querySelector("[data-testid='zen-status-button']")!;
    expect(done.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    render(null, root);
    root.remove();
  });

  it("sets a status color from the context menu without making the tab a todo", async () => {
    const { root, sendMessage } = mountSearchApp(vi.fn(), tabs, "overlay");
    const menu = () => root.querySelector("[data-testid='zen-tab-context-menu']");
    const row = () => root.querySelector("[data-testid='zen-search-item']")!;

    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-search-item']")).toBeTruthy(),
    );
    row().dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }),
    );
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Status"));
    expect(
      [...menu()!.querySelectorAll("[role='menuitemradio']")].map((item) => item.textContent),
    ).toEqual(["Red", "Orange", "Green"]);
    // No color yet, so there is nothing to clear.
    expect(menu()!.querySelector("[data-traffic-light='none']")).toBeNull();

    menu()!.querySelector<HTMLButtonElement>("[data-traffic-light='green']")!.click();
    await vi.waitFor(() => expect(menu()).toBeNull());
    expect(sendMessage).toHaveBeenCalledWith({ type: "setTabStatus", tabId: 1, light: "green" });
    await vi.waitFor(() => expect(row().getAttribute("data-status-light")).toBe("green"));
    expect(root.querySelector("[data-testid='zen-todo-column']")).toBeNull();

    render(null, root);
    root.remove();
  });

  it("shows a tab's status color in the context menu and can clear it", async () => {
    const { root, sendMessage } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [],
      [{ tabId: 2, light: "red" }],
    );
    const menu = () => root.querySelector("[data-testid='zen-tab-context-menu']");

    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-testid='zen-search-item'][data-status-light='red']"),
      ).toBeTruthy(),
    );
    root.querySelector("[data-testid='zen-search-item'][data-status-light='red']")!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Status"));
    expect(menu()!.querySelector("[data-traffic-light='red']")!.getAttribute("aria-checked")).toBe(
      "true",
    );

    menu()!.querySelector<HTMLButtonElement>("[data-traffic-light='none']")!.click();
    await vi.waitFor(() => expect(root.querySelector("[data-status-light]")).toBeNull());
    expect(sendMessage).toHaveBeenCalledWith({ type: "setTabStatus", tabId: 2, light: "none" });

    render(null, root);
    root.remove();
  });

  it("closes the status dropdown when its button is clicked again", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [],
      [{ tabId: 1, light: "red" }],
    );
    const statusButton = () =>
      root.querySelector<HTMLButtonElement>(
        "[data-testid='zen-search-item'] [data-testid='zen-status-button']",
      )!;
    const menu = () => root.querySelector("[data-testid='zen-traffic-light-menu']");

    await vi.waitFor(() => expect(root.querySelector("[data-status-light='red']")).toBeTruthy());
    statusButton().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    statusButton().click();
    await vi.waitFor(() => expect(menu()).not.toBeNull());
    expect(menu()!.querySelector("[data-traffic-light='red']")!.getAttribute("aria-checked")).toBe(
      "true",
    );

    statusButton().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    statusButton().click();
    await vi.waitFor(() => expect(menu()).toBeNull());

    render(null, root);
    root.remove();
  });

  it("marks a todo done from its Done button in the todo column", async () => {
    const { root, sendMessage, onClose } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [{ tabId: 2, status: "todo" }],
    );

    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-done-button']")).not.toBeNull(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-done-button']")!.click();

    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")).toBeNull(),
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "setTodo", tabId: 2, status: "none" });
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "switchTab" }));
    expect(onClose).not.toHaveBeenCalled();

    render(null, root);
    root.remove();
  });

  it("opens the tab context menu from a todo row", async () => {
    const { root, sendMessage } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [{ tabId: 2, status: "todo" }],
    );

    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-done-button']")).not.toBeNull(),
    );
    root.querySelector("[data-testid='zen-todo-done-button']")!.parentElement!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    const menu = () => root.querySelector("[data-testid='zen-tab-context-menu']");
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Mark as done"));
    expect(menu()?.textContent).toContain("Rename");
    expect(menu()?.textContent).toContain("Timer");

    [...root.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Timer"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: "getTab", tabId: 2 }));
    expect(sendMessage).not.toHaveBeenCalledWith({ type: "openTimerPopup", tabId: 2 });
    expect(menu()).toBeNull();

    render(null, root);
    root.remove();
  });

  it("opens the tab context menu from an issue entry", async () => {
    const forgeTabs = [
      { ...tabs[0], title: "Fix search", url: "https://github.com/acme/project/issues/42" },
    ];
    const { root, sendMessage } = mountSearchApp(vi.fn(), forgeTabs, "overlay");

    await vi.waitFor(() =>
      expect(root.querySelector("button[title*='github.com']")).not.toBeNull(),
    );
    root.querySelector("button[title*='github.com']")!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    const menu = () => root.querySelector("[data-testid='zen-tab-context-menu']");
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Mark as todo"));
    expect(menu()?.textContent).toContain("Rename");

    [...root.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Mark as todo"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "setTodo", tabId: 1, status: "todo" }),
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).toContain(
        "Fix search",
      ),
    );

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

  it("moves arrow navigation to the todo column and filters it when the query starts with @", async () => {
    const todoTabs = [
      ...tabs,
      { id: 3, title: "Deploy staging", url: "https://example.net", favIconUrl: "", windowId: 1 },
    ];
    const { root, onClose, sendMessage } = mountSearchApp(
      vi.fn(),
      todoTabs,
      "overlay",
      { detectForgeIssues: false },
      [],
      [
        { tabId: 2, status: "todo" },
        { tabId: 3, status: "todo" },
      ],
    );

    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("First tab"),
    );
    const column = root.querySelector("[data-testid='zen-todo-column']")!;
    expect(column.querySelector("[data-testid='zen-prefix-hint']")?.textContent).toBe("@ - ");

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "@deploy";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.querySelector("[data-todo-selected='true']")?.textContent).toContain(
        "Deploy staging",
      ),
    );
    expect(root.querySelector("[data-selected='true']")).toBeNull();
    expect(column.textContent).not.toContain("Second tab");
    expect(column.textContent).toContain("2 to do");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "switchTab", tabId: 3, domId: undefined }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });

  it("lists the current issue tab first in the navigator while issues are kept out of the tab list", async () => {
    const issueTabs = [
      { ...tabs[1], active: false },
      {
        id: 3,
        title: "Newer issue",
        url: "https://github.com/acme/project/issues/42",
        favIconUrl: "",
        windowId: 1,
        lastOpenedAt: Date.now(),
      },
      {
        id: 4,
        title: "Older issue",
        url: "https://github.com/acme/project/issues/7",
        favIconUrl: "",
        windowId: 1,
        active: true,
        lastOpenedAt: Date.now() - 24 * 60 * 60 * 1000,
      },
    ];
    const { root } = mountSearchApp(vi.fn(), issueTabs, "overlay", {
      detectForgeIssues: true,
      filterIssuesInOverlay: true,
    });

    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-current-issue']")?.textContent).toContain(
        "Older issue",
      ),
    );
    const entries = [...root.querySelectorAll("[data-testid='zen-issue-entry']")];
    expect(entries.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining("Older issue"),
      expect.stringContaining("Newer issue"),
    ]);
    expect(
      [...root.querySelectorAll("[data-testid='zen-prefix-hint']")].map((hint) => hint.textContent),
    ).toContain("! / # - ");

    // A query re-ranks the navigator, so the current entry is no longer pinned.
    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "#issue";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-current-issue']")).toBeNull(),
    );

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
