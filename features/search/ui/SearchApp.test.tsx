import { render } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchApp } from "@/features/search/ui/SearchApp";
import type { OmnibarView } from "@/shared/messaging/protocol";
import type { SpaceInfo, TabInfo, TabStatus, TabTimer, TabTodo } from "@/shared/types";

const play = vi.hoisted(() => vi.fn());

// The real engine is silent in jsdom; this one records which voices are asked for.
vi.mock("@/shared/ui/sound/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/ui/sound/engine")>()),
  createSoundEngine: () => ({ play, setVolume: vi.fn() }),
}));

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
  initialView?: OmnibarView,
  snapshotTimers: Partial<TabTimer>[] = [],
) {
  const sendMessage = vi.fn(async (message: { type: string; tabId?: number }) => {
    if (message.type === "getSnapshot") {
      return {
        tabs: snapshotTabs,
        spaces: snapshotSpaces,
        timers: snapshotTimers,
        todos: snapshotTodos,
        statuses: snapshotStatuses,
      };
    }
    if (message.type === "getTab") {
      return snapshotTabs[0];
    }
    if (message.type === "getFolders") {
      return [{ id: "docs", name: "Docs", spaceId: "s", spaceName: "Work", collapsed: false }];
    }
    if (message.type === "getPinnedUrl") {
      return snapshotTabs.find((tab) => tab.id === message.tabId)?.url ?? "https://example.com/";
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
  render(<SearchApp onClose={onClose} layout={layout} initialView={initialView} />, root);
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

  it("starts with the query a search view opens it on", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", undefined, [], [], [], {
      kind: "search",
      query: "Second",
    });

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    expect(input.value).toBe("Second");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("Second tab"),
    );
    // The strip still shows the current tab; the list does not.
    expect(
      [...root.querySelectorAll("[data-testid='zen-search-item']")].map((item) => item.textContent),
    ).toEqual([expect.stringContaining("Second tab")]);

    render(null, root);
    root.remove();
  });

  it("makes the search inert and focuses When while the timer view is open", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", undefined, [], [], [], {
      kind: "timer",
      tabId: 1,
    });
    const search = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    expect(search.hasAttribute("inert")).toBe(true);

    await vi.waitFor(() =>
      expect(document.activeElement?.closest("form")?.textContent).toContain("When"),
    );
    // Past the search's delayed focus retry, the When field still has focus.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(document.activeElement).not.toBe(search);
    expect(document.activeElement?.closest("form")?.textContent).toContain("When");

    render(null, root);
    root.remove();
  });

  it.each([
    { view: { kind: "timer", tabId: 1 }, label: "Timer for" },
    { view: { kind: "hosts", tabId: 1 }, label: "Overrides for" },
  ] as const)("names the tab the $view.kind view acts on", async ({ view, label }) => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", undefined, [], [], [], view);

    await vi.waitFor(() => {
      const summary = root.querySelector("[data-testid='zen-tab-summary']");
      expect(summary?.textContent).toContain(label);
      expect(summary?.textContent).toContain("First tab");
      expect(summary?.textContent).toContain("example.com");
    });

    render(null, root);
    root.remove();
  });

  it("counts tabs, spaces and GitHub tabs in the status bar", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      [...tabs, { ...tabs[1], id: 3, url: "https://github.com/acme/app/pull/7" }],
      "overlay",
      undefined,
      [{ id: "space-a", name: "Work", isActive: true }],
    );

    await vi.waitFor(() => {
      const bar = root.querySelector("[data-testid='zen-status-bar']");
      expect(bar?.textContent).toContain("3 tabs");
      expect(bar?.textContent).toContain("1 space");
      expect(bar?.textContent).toContain("1 GitHub");
    });
    expect(root.querySelector("[data-stat='gitlab']")).toBeNull();

    render(null, root);
    root.remove();
  });

  it("makes the search inert while the host overrides view is open", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", undefined, [], [], [], {
      kind: "hosts",
      tabId: 1,
    });
    const search = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    expect(search.hasAttribute("inert")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(document.activeElement).not.toBe(search);

    render(null, root);
    root.remove();
  });

  it.each([{ kind: "timer", tabId: 1 }, { kind: "hosts", tabId: 1 }, { kind: "timers" }] as const)(
    "closes the omnibar on Escape from the $kind view",
    async (initialView) => {
      const onClose = vi.fn();
      const { root } = mountSearchApp(onClose, tabs, "overlay", undefined, [], [], [], initialView);
      await vi.waitFor(() =>
        expect(
          root.querySelector("[data-testid='zen-tab-summary']") ??
            (root.textContent?.includes("Click a timer to go to its tab") ? root : null),
        ).toBeTruthy(),
      );
      // Let Preact run its effects, which register the key listeners.
      await new Promise((resolve) => setTimeout(resolve, 100));

      (document.activeElement ?? window).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);

      render(null, root);
      root.remove();
    },
  );

  it("closes the omnibar on Escape from an open context menu", async () => {
    const onClose = vi.fn();
    const { root } = mountSearchApp(onClose, tabs, "overlay");
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));
    root
      .querySelector("[data-testid='zen-search-item']")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 20 }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-tab-context-menu']")).toBeTruthy(),
    );

    const row = root.querySelector("[data-testid='zen-search-item']")!;
    row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2 }));
    expect(root.querySelector("[data-testid='zen-tab-context-menu']")).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    render(null, root);
    root.remove();
  });

  it("keeps the search usable without a view", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay");
    const search = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    expect(search.hasAttribute("inert")).toBe(false);
    await vi.waitFor(() => expect(document.activeElement).toBe(search));

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

    // The tab is the current one, so the toolbar toggle shows it open and closes it.
    const toggle = root.querySelector<HTMLButtonElement>(
      "button[title='Host overrides for this tab']",
    )!;
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    toggle.click();
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
        forgeTargetBranch: "main",
      },
    ];
    const { root, onClose, sendMessage } = mountSearchApp(vi.fn(), forgeTabs, "overlay");

    await vi.waitFor(() => expect(root.textContent).toContain("Issues and requests"));
    // Tabs and issues; the todo column stays hidden with no todos.
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("3/2");
    expect(root.textContent).toContain("GitHub");
    expect(root.textContent).toContain("GitLab");
    expect(root.textContent).toContain("Issues");
    expect(root.textContent).toContain("MRs → main");
    // The issues and the branch each get a folder.
    expect(root.querySelectorAll("[data-testid='zen-issue-folder']")).toHaveLength(2);
    expect(root.textContent).toContain("#42");
    expect(root.textContent).not.toContain("Merge request #7");
    expect(root.querySelectorAll("[data-testid='zen-search-item']")).toHaveLength(0);
    await vi.waitFor(() => expect(root.textContent).toContain("Recent"));
    expect(root.querySelector("span[title^='Last opened:']")).not.toBeNull();
    play.mockClear();
    root.querySelector<HTMLButtonElement>("button[title='Change issue sorting']")?.click();
    await vi.waitFor(() => expect(root.textContent).toContain("Old"));
    expect(play).toHaveBeenCalledWith("tick");

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "42";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(root.textContent).toContain("Fix search");
      expect(root.textContent).not.toContain("Improve filters");
    });

    root.querySelector<HTMLButtonElement>("button[title^='https://github.com']")?.click();
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

  it("lets the page show through the overlay at the chosen background opacity", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", { backgroundOpacity: 0.5 });

    const stage = await vi.waitFor(() => {
      const element = root.querySelector<HTMLElement>("[data-omnibar-stage]");
      expect(element?.style.getPropertyValue("--zs-bg-opacity")).toBe("0.5");
      return element!;
    });
    expect(stage.style.backdropFilter).toBe("blur(4px)");

    render(null, root);
    root.remove();
  });

  it("writes custom theme colours onto the overlay tokens", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", {
      accentColor: "#e0943a",
      chassisColor: "#161311",
      panelColor: "#221c19",
    });

    const stage = await vi.waitFor(() => {
      const element = root.querySelector<HTMLElement>("[data-omnibar-stage]");
      expect(element?.style.getPropertyValue("--zs-red")).toBe("#e0943a");
      return element!;
    });
    expect(stage.style.getPropertyValue("--zs-chassis")).toBe("#161311");
    expect(stage.style.getPropertyValue("--zs-card")).toBe("#221c19");
    expect(stage.style.color).toBe("");

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
    expect(todoRows()[0]?.textContent).not.toContain("Current tab");
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
    // Another tab is current, so the issue is listed in the navigator, not shown in the strip.
    const forgeTabs = [
      {
        ...tabs[0],
        active: false,
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
      },
      { ...tabs[1], active: true },
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

  it("keeps a todo row looking like other tab rows when it has no status color", async () => {
    const { root } = mountSearchApp(
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
    const todoRow = root.querySelector("[data-testid='zen-todo-column'] .zs-row")!;
    expect(todoRow.className).not.toContain("bg-red-500/");
    expect(todoRow.className).not.toMatch(/zs-red/);

    render(null, root);
    root.remove();
  });

  it("closes a tab and edits a pinned URL from the context menu", async () => {
    const { root, sendMessage } = mountSearchApp(vi.fn(), [
      { ...tabs[0], pinned: true, url: "https://mail.example.com/" },
    ]);
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
    });
    root.querySelector("[data-testid='zen-search-item']")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    const menu = () => root.querySelector("[data-testid='zen-tab-context-menu']");
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Close tab"));
    expect(menu()?.textContent).toContain("Edit pinned URL");
    expect(menu()?.textContent).toContain("Replace pinned URL with current");
    expect(menu()?.textContent).toContain("Move to folder");
    expect(
      [...menu()!.querySelectorAll("[role='menuitem']")].map((node) =>
        node.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual([
      "Close tab",
      "Rename",
      "Move to folder",
      "Edit pinned URL",
      "Replace pinned URL with current",
      "Mark as todo",
      "Timer",
      "⇄Host overrides…",
    ]);

    [...menu()!.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Move to folder"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-tab-folder-menu']")?.textContent).toContain(
        "Work · Docs",
      ),
    );
    [...root.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Docs"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "moveTabToFolder",
        tabId: 1,
        folderId: "docs",
      }),
    );

    root.querySelector("[data-testid='zen-search-item']")!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Close tab"));
    [...menu()!.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Close tab"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "closeTab", tabId: 1 }),
    );

    root.querySelector("[data-testid='zen-search-item']")!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    await vi.waitFor(() =>
      expect(menu()?.textContent).toContain("Replace pinned URL with current"),
    );
    [...menu()!.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Replace pinned URL with current"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "replacePinnedUrlWithCurrent",
        tabId: 1,
      }),
    );

    root.querySelector("[data-testid='zen-search-item']")!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Edit pinned URL"));
    [...menu()!.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Edit pinned URL"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("form")?.textContent).toContain("Edit pinned URL"),
    );
    const input = root.querySelector("form input") as HTMLInputElement;
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "getPinnedUrl", tabId: 1 }),
    );
    await vi.waitFor(() => expect(input.value).toBe("https://mail.example.com/"));
    input.value = "https://mail.example.com/inbox";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(input.value).toBe("https://mail.example.com/inbox"));
    root.querySelector<HTMLButtonElement>("form button[type='submit']")!.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "setPinnedUrl",
        tabId: 1,
        url: "https://mail.example.com/inbox",
      }),
    );

    render(null, root);
    root.remove();
  });

  it("clears the todos of one status color after confirming", async () => {
    const confirm = vi.spyOn(window, "confirm");
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

    // window.confirm can't show in the omnibar's chrome <browser>; the column asks instead.
    const prompt = () => root.querySelector("[data-testid='zen-todo-clear-confirm']");
    await vi.waitFor(() =>
      expect(prompt()?.textContent).toContain("Mark 1 todo with status red as done?"),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "clearTodos" }));

    const confirmButton = root.querySelector<HTMLButtonElement>(
      "[data-testid='zen-todo-clear-confirm-button']",
    )!;
    confirmButton.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    confirmButton.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "clearTodos", tabIds: [2] }),
    );
    expect(play).toHaveBeenCalledWith("success");
    expect(play).not.toHaveBeenCalledWith("down-primary");
    expect(prompt()).toBeNull();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).not.toContain(
        "Second tab",
      ),
    );
    await vi.waitFor(() => expect(root.querySelector("[data-status-light]")).toBeNull());

    confirm.mockRestore();
    render(null, root);
    root.remove();
  });

  it("keeps the todos when the clear confirmation is cancelled", async () => {
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

    const prompt = () => root.querySelector("[data-testid='zen-todo-clear-confirm']");
    await vi.waitFor(() => expect(prompt()?.textContent).toContain("Mark 1 todo as done?"));
    expect(select().value).toBe("");

    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear-cancel-button']")!.click();
    await vi.waitFor(() => expect(prompt()).toBeNull());
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "clearTodos" }));
    expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).toContain(
      "First tab",
    );

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
    await vi.waitFor(() => expect(menu()?.querySelector("[aria-label='Status']")).toBeTruthy());
    expect(
      [...menu()!.querySelectorAll("[role='menuitemradio']")].map((item) =>
        item.getAttribute("aria-label"),
      ),
    ).toEqual(["Red", "Orange", "Green", "No status"]);
    expect(menu()!.querySelector("[data-traffic-light='none']")).toBeTruthy();

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
    await vi.waitFor(() => expect(menu()?.querySelector("[aria-label='Status']")).toBeTruthy());
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
    expect(play).toHaveBeenCalledWith("success");

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
    // Another tab is current, so the issue is listed in the navigator, not shown in the strip.
    const forgeTabs = [
      {
        ...tabs[0],
        active: false,
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
      },
      { ...tabs[1], active: true },
    ];
    const { root, sendMessage } = mountSearchApp(vi.fn(), forgeTabs, "overlay");

    await vi.waitFor(() =>
      expect(root.querySelector("button[title^='https://github.com']")).not.toBeNull(),
    );
    root.querySelector("button[title^='https://github.com']")!.dispatchEvent(
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

  it("keeps pull-request tabs in overlay results when only issues are filtered out", async () => {
    const forgeTabs = [
      {
        ...tabs[0],
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
      },
      {
        ...tabs[1],
        title: "Ship it",
        url: "https://github.com/acme/project/pull/9",
      },
    ];
    const { root } = mountSearchApp(vi.fn(), forgeTabs, "overlay", {
      detectForgeIssues: true,
      filterIssuesInOverlay: true,
      filterRequestsInOverlay: false,
    });

    await vi.waitFor(() => expect(root.textContent).toContain("Issues and requests"));
    const tabTitles = [...root.querySelectorAll("[data-testid='zen-search-item']")].map(
      (item) => item.textContent,
    );
    expect(tabTitles.some((title) => title?.includes("Fix search"))).toBe(false);
    expect(tabTitles.some((title) => title?.includes("Ship it"))).toBe(true);

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
    expect(root.querySelector("[role='radio'][aria-checked='true']")?.textContent).toContain(
      "Issues",
    );

    input.value = "!";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-issue-selected='true']")?.textContent).toContain(
        "Improve filters",
      ),
    );
    expect(root.querySelector("[role='radio'][aria-checked='true']")?.textContent).toContain("MRs");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("Docs"),
    );
    expect(root.querySelector("[data-issue-selected='true']")).toBeNull();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
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

  it("keeps the current issue tab out of the navigator while issues are kept out of the tab list", async () => {
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
      expect(root.querySelector("[data-testid='zen-current-tab']")?.textContent).toContain(
        "Older issue",
      ),
    );
    // The current issue lives in the strip, not among the navigator entries.
    const entries = [...root.querySelectorAll("[data-testid='zen-issue-entry']")];
    expect(entries.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining("Newer issue"),
    ]);
    expect(
      [...root.querySelectorAll("[data-testid='zen-prefix-hint']")].map((hint) => hint.textContent),
    ).toContain("! / # - ");

    // A query re-ranks the navigator but leaves the strip where it is.
    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "#issue";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelectorAll("[data-testid='zen-issue-entry']").length).toBe(2),
    );
    expect(root.querySelector("[data-testid='zen-current-tab']")).not.toBeNull();

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
    play.mockClear();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "D", bubbles: true }));
    expect(play).toHaveBeenCalledWith("type");
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "D", bubbles: true }));
    expect(play).toHaveBeenCalledWith("type-up");
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

const GITLAB = "gitlab.com/acme/project";

/** Mounts the overlay over a snapshot, with a storage mock that remembers what is written. */
function mountOverlay({
  snapshotTabs,
  timers = [],
  todos = [],
  displaySettings,
  stored = {},
}: {
  snapshotTabs: Partial<TabInfo>[];
  timers?: Record<string, unknown>[];
  todos?: TabTodo[];
  displaySettings?: Record<string, unknown>;
  stored?: Record<string, unknown>;
}) {
  const set = vi.fn(async (_items: Record<string, unknown>) => undefined);
  const sendMessage = vi.fn(async ({ type }: { type: string }) =>
    type === "getSnapshot"
      ? { tabs: snapshotTabs, spaces: [], timers, todos, statuses: [] }
      : undefined,
  );
  Object.assign(globalThis, {
    browser: {
      runtime: {
        sendMessage,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            const all: Record<string, unknown> = {
              ...(displaySettings ? { displaySettings } : {}),
              ...stored,
            };
            return key in all ? { [key]: all[key] } : {};
          }),
          set,
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    },
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(<SearchApp onClose={vi.fn()} layout="overlay" />, root);
  const input = () => root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
  const press = (key: string, init: KeyboardEventInit = {}) =>
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  const unmount = () => {
    render(null, root);
    root.remove();
  };
  return { root, set, sendMessage, input, press, unmount };
}

const DAY = 24 * 60 * 60 * 1000;

/** Two issues, then two merge requests into main and one into develop, newest first. */
function forgeSnapshotTabs(): Partial<TabInfo>[] {
  const make = (id: number, title: string, path: string, days: number, branch?: string) => ({
    id,
    title,
    url: `https://gitlab.com/acme/project/${path}`,
    favIconUrl: "",
    windowId: 1,
    lastOpenedAt: Date.now() - days * DAY,
    ...(branch ? { forgeTargetBranch: branch } : {}),
  });
  return [
    make(10, "Alpha issue", "-/issues/10", 1),
    make(11, "Beta issue", "-/issues/11", 2),
    make(7, "Seven request", "-/merge_requests/7", 3, "main"),
    make(9, "Nine request", "-/merge_requests/9", 4, "main"),
    make(8, "Eight request", "-/merge_requests/8", 5, "develop"),
  ];
}

const entryUrls = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("[data-testid='zen-issue-entry']")].map(
    (element) => element.querySelector("button")?.getAttribute("title") ?? "",
  );

const selectedUrl = (root: HTMLElement) =>
  root.querySelector("[data-issue-selected='true'] button")?.getAttribute("title") ?? "";

const radios = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLButtonElement>("[role='radio']"),
];

function folder(root: HTMLElement, label: string) {
  const match = [...root.querySelectorAll<HTMLElement>("[data-testid='zen-issue-folder']")].find(
    (element) => element.querySelector(".zs-tree-trigger")?.getAttribute("title") === label,
  );
  if (!match) throw new Error(`No folder ${label}`);
  return {
    element: match,
    trigger: match.querySelector<HTMLButtonElement>(".zs-tree-trigger")!,
    clip: match.querySelector<HTMLElement>(".zs-acc-clip")!,
  };
}

describe("SearchApp issue filter, accordions, timers dock and sound", () => {
  beforeEach(() => play.mockClear());

  it("narrows the navigator to issues and shows the counts", async () => {
    const { root, unmount } = mountOverlay({ snapshotTabs: forgeSnapshotTabs() });
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));

    expect(radios(root).map((tab) => tab.textContent)).toEqual(["All5", "Issues2", "MRs3"]);
    expect(radios(root)[0]?.getAttribute("aria-checked")).toBe("true");

    radios(root)[1]!.click();
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(2));
    expect(entryUrls(root).every((url) => url.includes("/issues/"))).toBe(true);
    expect(root.querySelector("[role='radio'][aria-checked='true']")?.textContent).toBe("Issues2");
    // The counts still describe everything the query left.
    expect(radios(root).map((tab) => tab.textContent)).toEqual(["All5", "Issues2", "MRs3"]);

    radios(root)[2]!.click();
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(3));
    expect(entryUrls(root).every((url) => url.includes("/merge_requests/"))).toBe(true);
    unmount();
  });

  it("calls the third tab PRs when every entry is a GitHub one", async () => {
    const { root, unmount } = mountOverlay({
      snapshotTabs: [
        {
          id: 1,
          title: "Fix search",
          url: "https://github.com/acme/project/pull/5",
          favIconUrl: "",
          windowId: 1,
          forgeTargetBranch: "main",
        },
      ],
    });
    await vi.waitFor(() => expect(radios(root)[2]?.textContent).toBe("PRs1"));
    unmount();
  });

  it("never lets ArrowDown select an entry the filter hides", async () => {
    const { root, input, press, unmount } = mountOverlay({ snapshotTabs: forgeSnapshotTabs() });
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));
    radios(root)[1]!.click();
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(2));

    input().value = "#";
    input().dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(selectedUrl(root)).toContain("/issues/"));
    const seen = new Set<string>();
    for (let step = 0; step < 6; step++) {
      press("ArrowDown");
      await vi.waitFor(() => expect(selectedUrl(root)).not.toBe(""));
      seen.add(selectedUrl(root));
    }
    expect([...seen].every((url) => url.includes("/issues/"))).toBe(true);
    expect(seen.size).toBe(2);
    unmount();
  });

  it("collapses every issue group from the header and expands them again", async () => {
    const { root, set, unmount } = mountOverlay({ snapshotTabs: forgeSnapshotTabs() });
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));

    const button = () =>
      root.querySelector<HTMLButtonElement>("[data-testid='zen-collapse-issues']")!;
    expect(button().textContent).toBe("Collapse all");
    expect(button().previousElementSibling?.classList.contains("zs-head-rule")).toBe(true);
    expect(button().nextElementSibling?.classList.contains("zs-head-rule")).toBe(true);
    expect(button().closest(".zs-head")?.textContent).toContain("Recent");

    button().click();
    await vi.waitFor(() => expect(button().textContent).toBe("Expand all"));
    const triggers = [...root.querySelectorAll<HTMLButtonElement>(".zs-tree-trigger")];
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.every((trigger) => trigger.getAttribute("aria-expanded") === "false")).toBe(
      true,
    );
    const stored = set.mock.calls.map((call) => call[0]?.forgeCollapsedGroups).find(Array.isArray);
    expect(stored).toHaveLength(4);

    button().click();
    await vi.waitFor(() => expect(button().textContent).toBe("Collapse all"));
    expect(
      [...root.querySelectorAll(".zs-tree-trigger")].every(
        (trigger) => trigger.getAttribute("aria-expanded") === "true",
      ),
    ).toBe(true);
    unmount();
  });

  it("collapses a branch, shows its count, and walks the keyboard past it", async () => {
    const { root, set, input, press, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
    });
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));

    const main = folder(root, "MRs → main");
    expect(main.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(main.clip.hasAttribute("inert")).toBe(false);
    expect(main.trigger.querySelector(".zs-acc-count")?.textContent).toBe("2");

    main.trigger.click();
    await vi.waitFor(() => expect(main.trigger.getAttribute("aria-expanded")).toBe("false"));
    expect(main.clip.hasAttribute("inert")).toBe(true);
    expect(main.trigger.querySelector(".zs-acc-count")?.textContent).toBe("2");
    expect(set).toHaveBeenCalledWith({
      forgeCollapsedGroups: [`branch:gitlab:${GITLAB}:main`],
    });

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await vi.waitFor(() => expect(selectedUrl(root)).not.toBe(""));
    const seen = new Set<string>();
    for (let step = 0; step < 8; step++) {
      press("ArrowDown");
      await vi.waitFor(() => expect(selectedUrl(root)).not.toBe(""));
      seen.add(selectedUrl(root));
    }
    expect([...seen].some((url) => url.includes("/merge_requests/7"))).toBe(false);
    expect([...seen].some((url) => url.includes("/merge_requests/9"))).toBe(false);
    expect([...seen].some((url) => url.includes("/merge_requests/8"))).toBe(true);

    main.trigger.click();
    await vi.waitFor(() => expect(main.trigger.getAttribute("aria-expanded")).toBe("true"));
    expect(set).toHaveBeenLastCalledWith({ forgeCollapsedGroups: [] });
    unmount();
  });

  it("opens collapsed issue folders when the query starts with #", async () => {
    const { root, input, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
      stored: { forgeCollapsedGroups: [`issues:gitlab:${GITLAB}`, `project:gitlab:${GITLAB}`] },
    });
    await vi.waitFor(() =>
      expect(root.querySelector(".zs-tree-trigger")?.getAttribute("aria-expanded")).toBe("false"),
    );

    input().value = "#";
    input().dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(selectedUrl(root)).toContain("/issues/"));
    const issues = folder(root, "Issues");
    expect(issues.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(issues.clip.hasAttribute("inert")).toBe(false);
    unmount();
  });

  it("starts with the groups that were left collapsed", async () => {
    const { root, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
      stored: { forgeCollapsedGroups: [`project:gitlab:${GITLAB}`] },
    });
    await vi.waitFor(() =>
      expect(root.querySelector(".zs-tree-trigger")?.getAttribute("aria-expanded")).toBe("false"),
    );
    expect(root.querySelector(".zs-tree-trigger .zs-acc-count")?.textContent).toBe("5");
    unmount();
  });

  it("collapses with Alt+Left and expands the nearest collapsed group with Alt+Right", async () => {
    const { root, set, press, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
    });
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));
    press("Tab");
    await vi.waitFor(() => expect(selectedUrl(root)).toContain("/issues/10"));

    const issues = folder(root, "Issues");
    // Plain Left still pages through the list; only Alt+Left collapses.
    press("ArrowLeft");
    expect(issues.trigger.getAttribute("aria-expanded")).toBe("true");

    press("ArrowLeft", { altKey: true });
    await vi.waitFor(() => expect(issues.trigger.getAttribute("aria-expanded")).toBe("false"));
    expect(set).toHaveBeenLastCalledWith({
      forgeCollapsedGroups: [`issues:gitlab:${GITLAB}`],
    });
    // The selection moved on to a visible entry rather than staying on a hidden one.
    await vi.waitFor(() => expect(selectedUrl(root)).toContain("/merge_requests/"));

    press("ArrowRight", { altKey: true });
    await vi.waitFor(() => expect(issues.trigger.getAttribute("aria-expanded")).toBe("true"));
    expect(set).toHaveBeenLastCalledWith({ forgeCollapsedGroups: [] });
    unmount();
  });

  it("docks the timers under the todos and keeps them there with 30 todos", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      id: 100 + index,
      title: `Todo tab ${index}`,
      url: `https://example.com/${index}`,
      favIconUrl: "",
      windowId: 1,
    }));
    const { root, unmount } = mountOverlay({
      snapshotTabs: many,
      todos: many.map((tab) => ({ tabId: tab.id, status: "todo" as const })),
      timers: [
        {
          timerId: "later",
          tabId: 101,
          endAt: Date.now() + 3 * 60 * 60 * 1000,
          title: "Later timer",
          originalLabel: "",
          url: "",
        },
        {
          timerId: "soon",
          tabId: 102,
          endAt: Date.now() + 5 * 60 * 1000,
          title: "Soonest timer",
          originalLabel: "",
          url: "",
        },
      ],
    });

    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-timers-dock']")).not.toBeNull(),
    );
    const dock = root.querySelector("[data-testid='zen-timers-dock']")!;
    const column = root.querySelector("[data-testid='zen-todo-column']")!;
    expect(dock.textContent).toContain("Timers");
    expect(dock.querySelector("[data-testid='zen-timers-dock-soonest']")?.textContent).toContain(
      "Soonest timer",
    );
    // The soonest timer is the readout, so the rows only list the other one.
    expect(dock.querySelectorAll("li")).toHaveLength(1);
    expect(dock.querySelector("li")?.textContent).toContain("Later timer");
    // The todos take the rest of the column and scroll inside their own list.
    expect(column.className).toContain("flex-1");
    expect(column.className).not.toContain("max-h-[50%]");
    expect(dock.className).toContain("shrink-0");
    expect(column.querySelector(".zen-scroll")?.className).toContain("overflow-y-auto");
    expect(column.querySelector(".zen-scroll")?.children.length).toBe(30);
    expect(column.parentElement).toBe(dock.parentElement);
    expect(column.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One right column, not a fourth.
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("3/2");
    unmount();
  });

  it("lists only the soonest three timers in the dock and leaves the rest to the drawer", async () => {
    const minutes = [5, 50, 20, 90, 120];
    const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
    const { root, unmount } = mountOverlay({
      snapshotTabs: tabs,
      timers: minutes.map((minute, index) => ({
        timerId: `t${index}`,
        tabId: index + 1,
        endAt: Date.now() + minute * 60 * 1000,
        title: names[index]!,
        originalLabel: "",
        url: "",
      })),
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-timers-dock']")).not.toBeNull(),
    );
    const dock = root.querySelector("[data-testid='zen-timers-dock']")!;
    expect(dock.querySelector("[data-testid='zen-timers-dock-soonest']")?.textContent).toContain(
      "Alpha",
    );
    const rows = [...dock.querySelectorAll("li")].map((row) => row.textContent ?? "");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Charlie");
    expect(rows[1]).toContain("Bravo");
    expect(dock.textContent).not.toContain("Delta");
    expect(dock.textContent).not.toContain("Echo");
    // Each shown row keeps its Edit and Clear keys.
    expect(dock.querySelectorAll("li button").length).toBe(rows.length * 3);

    // The ⏱ button lists all five.
    root.querySelector<HTMLButtonElement>("button[title='Show active timers']")!.click();
    await vi.waitFor(() => expect(root.textContent).toContain("Echo"));
    expect(root.textContent).toContain("Delta");
    unmount();
  });

  it("shows the dock without todos, and lets the todos fill the column without timers", async () => {
    const { root, unmount } = mountOverlay({
      snapshotTabs: tabs,
      timers: [
        {
          timerId: "t",
          tabId: 1,
          endAt: Date.now() + 60 * 60 * 1000,
          title: "Only timer",
          originalLabel: "",
          url: "",
        },
      ],
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-timers-dock']")).not.toBeNull(),
    );
    expect(root.querySelector("[data-testid='zen-todo-column']")).toBeNull();
    unmount();

    const withTodo = mountOverlay({ snapshotTabs: tabs, todos: [{ tabId: 2, status: "todo" }] });
    await vi.waitFor(() =>
      expect(withTodo.root.querySelector("[data-testid='zen-todo-column']")).not.toBeNull(),
    );
    expect(withTodo.root.querySelector("[data-testid='zen-timers-dock']")).toBeNull();
    expect(withTodo.root.querySelector("[data-testid='zen-todo-column']")?.className).not.toContain(
      "max-h-[50%]",
    );
    withTodo.unmount();
  });

  it("plays key sounds from event handlers when sound is on", async () => {
    const { root, press, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
      displaySettings: { soundEnabled: true },
    });
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));
    // Rendering and loading are silent.
    expect(play).not.toHaveBeenCalled();

    press("a");
    expect(play).toHaveBeenCalledWith("type");
    press(" ");
    expect(play).toHaveBeenCalledWith("type-space");
    radios(root)[1]!.click();
    expect(play).toHaveBeenCalledWith("tick");
    unmount();
  });

  it("clicks the small row keys on the way down and up, but leaves latches to their own sound", async () => {
    const { root, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
      displaySettings: { soundEnabled: true },
    });
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));
    const pointer = (element: Element, type: "pointerdown" | "pointerup") =>
      element.dispatchEvent(new Event(type, { bubbles: true }));

    const timerKey = root.querySelector("[data-testid='zen-timer-button']")!;
    pointer(timerKey, "pointerdown");
    expect(play).toHaveBeenLastCalledWith("down");
    pointer(timerKey, "pointerup");
    expect(play).toHaveBeenLastCalledWith("up");

    play.mockClear();
    pointer(root.querySelector("[data-testid='zen-todo-button']")!, "pointerdown");
    pointer(root.querySelector("[data-testid='zen-status-button']")!, "pointerdown");
    expect(play).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-button']")!.click();
    expect(play).toHaveBeenCalledWith("mark");
    unmount();
  });

  it("never plays a sound with sound off", async () => {
    const { root, press, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
      displaySettings: { soundEnabled: false },
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-omnibar-stage]")?.getAttribute("data-omnibar-stage")).toBe(
        "open",
      ),
    );
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));

    press("a");
    press("ArrowDown");
    radios(root)[1]!.click();
    folder(root, "Issues").trigger.click();
    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-button']")?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(play).not.toHaveBeenCalled();
    unmount();
  });
});

describe("SearchApp current-tab strip and toolbar toggles", () => {
  const issueTab = {
    ...tabs[0],
    title: "Fix search",
    url: "https://github.com/acme/project/issues/42",
  };
  const strip = (root: HTMLElement) => root.querySelector("[data-testid='zen-current-tab']");
  const finish = (root: HTMLElement) => {
    render(null, root);
    root.remove();
  };

  it("shows the forge tag, ref, countdown and working keys for an active issue tab", async () => {
    const { root, sendMessage } = mountSearchApp(
      vi.fn(),
      [issueTab, { ...tabs[1] }],
      "overlay",
      undefined,
      [],
      [],
      [],
      undefined,
      [{ timerId: "t1", tabId: 1, endAt: Date.now() + 5 * 60_000 }],
    );

    await vi.waitFor(() => expect(strip(root)?.textContent).toContain("Fix search"));
    expect(strip(root)?.textContent).toContain("ISSUE");
    expect(strip(root)?.textContent).toContain("#42");
    await vi.waitFor(() => expect(strip(root)?.textContent).toMatch(/⏱ \d+m/));

    strip(root)!.querySelector<HTMLButtonElement>("[data-testid='zen-todo-button']")!.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "setTodo", tabId: 1, status: "todo" }),
    );

    // In the overlay the timer key opens the timer view for the tab.
    strip(root)!.querySelector<HTMLButtonElement>("[data-testid='zen-timer-button']")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-tab-summary']")?.textContent).toContain(
        "Timer for",
      ),
    );
    expect(strip(root)).toBeNull();

    finish(root);
  });

  it("closes the search when the current-tab strip is clicked", async () => {
    const onClose = vi.fn();
    const { root, sendMessage } = mountSearchApp(onClose, tabs);
    await vi.waitFor(() => expect(strip(root)?.textContent).toContain("First tab"));

    strip(root)!.querySelector("span.zs-row-title")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "switchTab" }));

    onClose.mockClear();
    strip(root)!.querySelector<HTMLButtonElement>("[data-testid='zen-todo-button']")!.click();
    expect(onClose).not.toHaveBeenCalled();

    finish(root);
  });

  it("keeps the strip out of the arrow-key order", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs);
    await vi.waitFor(() => expect(strip(root)?.textContent).toContain("First tab"));
    expect(strip(root)!.querySelector("[role='option'], [data-selected]")).toBeNull();

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    const selected = () => root.querySelector("[data-selected='true']");
    await vi.waitFor(() => expect(selected()?.textContent).toContain("First tab"));
    expect(strip(root)!.contains(selected())).toBe(false);

    // The strip is no stop on the way: ArrowDown goes straight to the next tab.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await vi.waitFor(() => expect(selected()?.textContent).toContain("Second tab"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await vi.waitFor(() => expect(selected()?.textContent).toContain("First tab"));
    expect(strip(root)!.contains(selected())).toBe(false);

    finish(root);
  });

  it("toggles the host overrides view from the toolbar button", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay");
    await vi.waitFor(() => expect(strip(root)).not.toBeNull());
    const toggle = () =>
      root.querySelector<HTMLButtonElement>("button[title='Host overrides for this tab']")!;
    expect(toggle().getAttribute("aria-pressed")).toBe("false");

    toggle().click();
    await vi.waitFor(() => expect(root.querySelector("h1")?.textContent).toBe("Host overrides"));
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(strip(root)).toBeNull();

    toggle().click();
    await vi.waitFor(() => expect(root.querySelector("h1")).toBeNull());
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(strip(root)).not.toBeNull();

    finish(root);
  });

  it("keeps the timer button's icon when the timers view is open", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay");
    await vi.waitFor(() => expect(strip(root)).not.toBeNull());
    const button = () =>
      root.querySelector<HTMLButtonElement>("button[aria-pressed][title*='timers']")!;
    const icon = () => button().querySelector("svg")!.innerHTML;
    const before = icon();
    expect(button().getAttribute("aria-pressed")).toBe("false");

    button().click();
    await vi.waitFor(() => expect(button().getAttribute("aria-pressed")).toBe("true"));
    expect(icon()).toBe(before);

    finish(root);
  });

  it.each([{ kind: "timers" }, { kind: "timer", tabId: 1 }, { kind: "hosts", tabId: 1 }] as const)(
    "has no Back to search button in the $kind view",
    async (view) => {
      const { root } = mountSearchApp(vi.fn(), tabs, "overlay", undefined, [], [], [], view);
      await vi.waitFor(() =>
        expect(root.querySelector("[data-testid='zen-search-input']")).toBeTruthy(),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(root.textContent).not.toContain("Back to search");
      finish(root);
    },
  );

  it("renders the strip in the toolbar popup too", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "popup");
    await vi.waitFor(() => expect(strip(root)?.textContent).toContain("First tab"));
    // One compact line: the space or host is left out.
    expect(strip(root)?.textContent).not.toContain("example.com");
    finish(root);
  });
});

describe("SearchApp tab folders", () => {
  const docs = { id: "docs", name: "Docs" };
  const infra = { id: "infra", name: "Infra" };
  const folderTabs = (): Partial<TabInfo>[] => [
    { id: 1, title: "Alpha doc", url: "https://example.com/a", windowId: 1, folderPath: [docs] },
    { id: 2, title: "Beta doc", url: "https://example.com/b", windowId: 1, folderPath: [docs] },
    {
      id: 3,
      title: "Gamma infra",
      url: "https://example.com/c",
      windowId: 1,
      folderPath: [docs, infra],
    },
    { id: 4, title: "Delta loose", url: "https://example.com/d", windowId: 1 },
  ];
  const header = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll<HTMLButtonElement>("[data-testid='zen-folder-group']")].find(
      (button) => button.textContent?.includes(name),
    )!;
  // A closed folder keeps its rows mounted for the height animation, so a row
  // inside a hidden panel does not count as showing.
  const rows = (root: HTMLElement) =>
    [...root.querySelectorAll("[data-testid='zen-search-item']")]
      .filter((row) => row.closest(".zs-acc-panel[aria-hidden='true']") === null)
      .map((row) => row.textContent);

  it("collapses every folder from the header and expands them again", async () => {
    const { root, set, unmount } = mountOverlay({ snapshotTabs: folderTabs() });
    await vi.waitFor(() => expect(rows(root)).toHaveLength(4));

    const button = () =>
      root.querySelector<HTMLButtonElement>("[data-testid='zen-collapse-tabs']")!;
    const head = () => button().closest(".zs-head")!;
    expect(button().textContent).toBe("Collapse all");
    expect(button().previousElementSibling?.classList.contains("zs-head-rule")).toBe(true);
    expect(button().nextElementSibling?.classList.contains("zs-head-rule")).toBe(true);
    expect(head().querySelector("[data-testid='zen-tab-count']")?.textContent).toBe("4");

    button().click();
    await vi.waitFor(() => expect(rows(root)).toHaveLength(1));
    expect(rows(root)[0]).toContain("Delta loose");
    expect(button().textContent).toBe("Expand all");
    expect(set).toHaveBeenCalledWith({
      tabFolderCollapsed: ["folder:docs", "folder:infra"],
    });

    button().click();
    await vi.waitFor(() => expect(rows(root)).toHaveLength(4));
    expect(button().textContent).toBe("Collapse all");
    expect(set).toHaveBeenLastCalledWith({ tabFolderCollapsed: [] });
    unmount();
  });

  it("keeps the current tab visible in its folder when every folder is collapsed", async () => {
    const other = { id: "other", name: "Other" };
    const snapshotTabs = [
      ...folderTabs().map((tab) => ({ ...tab, active: tab.id === 3 })),
      {
        id: 5,
        title: "Epsilon other",
        url: "https://example.com/e",
        windowId: 1,
        folderPath: [other],
      },
    ];
    const { root, unmount } = mountOverlay({ snapshotTabs });
    await vi.waitFor(() => expect(rows(root)).toHaveLength(5));

    root.querySelector<HTMLButtonElement>("[data-testid='zen-collapse-tabs']")!.click();
    await vi.waitFor(() =>
      expect(header(root, "Other").getAttribute("aria-expanded")).toBe("false"),
    );
    expect(header(root, "Docs").getAttribute("aria-expanded")).toBe("false");
    expect(header(root, "Infra").getAttribute("aria-expanded")).toBe("false");
    expect(rows(root).some((title) => title?.includes("Gamma infra"))).toBe(true);
    expect(rows(root).some((title) => title?.includes("Alpha doc"))).toBe(false);
    expect(rows(root).some((title) => title?.includes("Beta doc"))).toBe(false);
    expect(rows(root).some((title) => title?.includes("Epsilon other"))).toBe(false);
    expect(root.querySelector("[data-testid='zen-collapse-tabs']")?.textContent).toBe("Expand all");

    header(root, "Docs").click();
    await vi.waitFor(() =>
      expect(rows(root).some((title) => title?.includes("Alpha doc"))).toBe(true),
    );
    expect(rows(root).some((title) => title?.includes("Beta doc"))).toBe(true);
    expect(rows(root).some((title) => title?.includes("Gamma infra"))).toBe(true);
    expect(root.querySelector("[data-testid='zen-collapse-tabs']")?.textContent).toBe(
      "Collapse all",
    );
    unmount();
  });

  it("collapses a folder from its chevron, keeps its count, and stores the choice", async () => {
    const { root, set, unmount } = mountOverlay({ snapshotTabs: folderTabs() });
    await vi.waitFor(() => expect(rows(root)).toHaveLength(4));
    expect(header(root, "Docs").getAttribute("aria-expanded")).toBe("true");
    expect(header(root, "Docs").querySelector(".zs-tree-toggle")).not.toBeNull();
    expect(header(root, "Infra").getAttribute("aria-expanded")).toBe("true");

    header(root, "Docs").click();
    await vi.waitFor(() =>
      expect(header(root, "Docs").getAttribute("aria-expanded")).toBe("false"),
    );
    // Its sub-folder goes with it; the count still says what is inside.
    // The rows stay mounted so the panel can ease shut, the same way an issue folder does.
    const docsPanel = header(root, "Docs").closest("li")?.querySelector(".zs-acc-panel");
    expect(docsPanel?.getAttribute("aria-hidden")).toBe("true");
    expect(docsPanel?.querySelector(".zs-acc-clip")?.hasAttribute("inert")).toBe(true);
    expect(rows(root)).toHaveLength(1);
    expect(rows(root)[0]).toContain("Delta loose");
    expect(header(root, "Docs").querySelector(".zs-section-count")?.textContent).toBe("3");
    expect(set).toHaveBeenCalledWith({ tabFolderCollapsed: ["folder:docs"] });

    header(root, "Docs").click();
    await vi.waitFor(() => expect(rows(root)).toHaveLength(4));
    expect(set).toHaveBeenLastCalledWith({ tabFolderCollapsed: [] });
    unmount();
  });

  it("collapses just a sub-folder", async () => {
    const { root, unmount } = mountOverlay({ snapshotTabs: folderTabs() });
    await vi.waitFor(() => expect(rows(root)).toHaveLength(4));

    header(root, "Infra").click();
    await vi.waitFor(() => expect(rows(root)).toHaveLength(3));
    expect(rows(root).some((title) => title?.includes("Gamma infra"))).toBe(false);
    expect(rows(root).some((title) => title?.includes("Alpha doc"))).toBe(true);
    unmount();
  });

  it("starts with the folders that were left collapsed", async () => {
    const { root, unmount } = mountOverlay({
      snapshotTabs: folderTabs(),
      stored: { tabFolderCollapsed: ["folder:docs"] },
    });
    await vi.waitFor(() => expect(rows(root)).toHaveLength(1));
    expect(header(root, "Docs").getAttribute("aria-expanded")).toBe("false");
    unmount();
  });

  it("shows every match while a query is active, then folds the folder again", async () => {
    const { root, input, unmount } = mountOverlay({
      snapshotTabs: folderTabs(),
      stored: { tabFolderCollapsed: ["folder:docs"] },
    });
    await vi.waitFor(() => expect(rows(root)).toHaveLength(1));

    input().value = "alpha";
    input().dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(rows(root).some((title) => title?.includes("Alpha doc"))).toBe(true),
    );

    input().value = "";
    input().dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(rows(root).some((title) => title?.includes("Alpha doc"))).toBe(false),
    );
    unmount();
  });

  it("keeps nested folders in one tree when grouping by subfolders is on", async () => {
    const { root, unmount } = mountOverlay({ snapshotTabs: folderTabs() });
    await vi.waitFor(() => expect(header(root, "Infra")).toBeTruthy());
    expect(
      header(root, "Docs").closest("li")?.querySelector("[data-testid='zen-folder-section']"),
    ).toBe(header(root, "Infra").closest("li"));
    unmount();
  });

  it("flattens nested folders into the parent when grouping by subfolders is off", async () => {
    const { root, unmount } = mountOverlay({
      snapshotTabs: folderTabs(),
      displaySettings: { groupFolders: true, groupSubfolders: false },
    });
    await vi.waitFor(() => expect(header(root, "Docs")).toBeTruthy());
    expect(header(root, "Infra")).toBeUndefined();
    expect(rows(root).some((title) => title?.includes("Gamma infra"))).toBe(true);
    unmount();
  });

  it("walks the keyboard past a collapsed folder", async () => {
    const { root, press, unmount } = mountOverlay({
      snapshotTabs: folderTabs(),
      stored: { tabFolderCollapsed: ["folder:docs"] },
    });
    await vi.waitFor(() => expect(rows(root)).toHaveLength(1));
    for (let step = 0; step < 3; step++) press("ArrowDown");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-selected='true']")?.textContent).toContain("Delta loose"),
    );
    unmount();
  });
});
