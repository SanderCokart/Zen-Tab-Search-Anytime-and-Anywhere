import { render } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchSessionCache, SearchApp } from "@/features/search/ui/SearchApp";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import { applyPreset } from "@/features/settings/model/complexity";
import type { OmnibarView } from "@/shared/messaging/protocol";
import type { SpaceInfo, TabInfo, TabStatus, TabTimer, TabTodo } from "@/shared/types";

const play = vi.hoisted(() => vi.fn());
const motionReorder = vi.hoisted(() => ({
  onReorder: undefined as ((ids: number[]) => void) | undefined,
  dragStart: undefined as ((event: PointerEvent) => void) | undefined,
}));
const motionAnimate = vi.hoisted(() => vi.fn());

vi.mock("motion", () => ({
  animate: (...args: unknown[]) => {
    const result = motionAnimate(...args);
    return result ?? { stop: vi.fn(), finished: Promise.resolve() };
  },
}));

// The real engine is silent in jsdom; this one records which voices are asked for.
vi.mock("@/shared/ui/sound/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/ui/sound/engine")>()),
  createSoundEngine: () => ({ play, setVolume: vi.fn() }),
}));

vi.mock("motion/react", async () => {
  const { h } = await import("preact");
  return {
    useDragControls: () => ({
      start: (event: PointerEvent) => motionReorder.dragStart?.(event),
      cancel: () => undefined,
      stop: () => undefined,
    }),
    Reorder: {
      Group: (props: {
        children?: unknown;
        as?: string;
        axis?: string;
        values?: number[];
        onReorder?: (ids: number[]) => void;
        className?: string;
        class?: string;
      }) => {
        motionReorder.onReorder = props.onReorder;
        return h(
          props.as ?? "div",
          { class: props.class ?? props.className, "data-testid": "zen-todo-list" },
          props.children as never,
        );
      },
      Item: (props: {
        children?: unknown;
        as?: string;
        value?: unknown;
        whileDrag?: unknown;
        dragListener?: boolean;
        dragControls?: unknown;
        className?: string;
        class?: string;
        "data-testid"?: string;
        "data-todo-selected"?: string;
        "data-current"?: string;
        "data-status-light"?: string;
        onContextMenu?: (event: MouseEvent) => void;
        onPointerDown?: (event: PointerEvent) => void;
        onPointerMove?: (event: PointerEvent) => void;
        onPointerUp?: () => void;
        onPointerCancel?: () => void;
        onClick?: (event: MouseEvent) => void;
      }) =>
        h(
          props.as ?? "div",
          {
            class: props.class ?? props.className,
            "data-testid": props["data-testid"],
            "data-todo-selected": props["data-todo-selected"],
            "data-current": props["data-current"],
            "data-status-light": props["data-status-light"],
            onContextMenu: props.onContextMenu,
            onPointerDown: props.onPointerDown,
            onPointerMove: props.onPointerMove,
            onPointerUp: props.onPointerUp,
            onPointerCancel: props.onPointerCancel,
            onClick: props.onClick,
          },
          props.children as never,
        ),
    },
  };
});

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
  updateAvailable = false,
  reveal?: number,
) {
  const sendMessage = vi.fn(async (message: { type: string; tabId?: number }) => {
    if (message.type === "getSnapshot") {
      return {
        tabs: snapshotTabs,
        spaces: snapshotSpaces,
        timers: snapshotTimers,
        statuses: snapshotStatuses,
      };
    }
    if (message.type === "getTodos") {
      return snapshotTodos;
    }
    if (message.type === "getTab") {
      return snapshotTabs[0];
    }
    if (message.type === "getFolders") {
      return [{ id: "docs", name: "Docs", spaceId: "s", spaceName: "Work", collapsed: false }];
    }
    if (message.type === "organizeForgeIssueTabs") {
      return { foldersCreated: 1, tabsMoved: 1, skipped: 0 };
    }
    if (message.type === "getPinnedUrl") {
      return snapshotTabs.find((tab) => tab.id === message.tabId)?.url ?? "https://example.com/";
    }
    if (message.type === "getUpdateStatus") {
      return {
        currentVersion: "4.0.0",
        latest: updateAvailable
          ? {
              version: "4.1.0",
              zipUrl: "https://example.com/zen-deck-firefox.zip",
              releaseUrl: "https://example.com/releases/tag/v4.1.0",
            }
          : null,
        updateAvailable,
        demo: false,
        canInstall: true,
        checkedAt: null,
      };
    }
    if (message.type === "getBridgeStatus") {
      return { connected: false };
    }
    return undefined;
  });
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  Object.assign(globalThis, {
    browser: {
      runtime: {
        sendMessage,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            displaySettings: {
              ...DEFAULT_DISPLAY_SETTINGS,
              ...applyPreset("dev"),
              ...displaySettings,
            },
            complexitySetupDone: true,
          })),
          set: vi.fn(async () => undefined),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    },
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(
    <SearchApp onClose={onClose} layout={layout} initialView={initialView} reveal={reveal} />,
    root,
  );
  return { root, onClose, sendMessage, writeText };
}

function resolvedMotion() {
  return { stop: vi.fn(), finished: Promise.resolve() };
}

beforeEach(() => {
  motionAnimate.mockReset();
  motionAnimate.mockImplementation(resolvedMotion);
});

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

  it("opens a web search tab on Shift+Enter", async () => {
    const { root, onClose, sendMessage } = mountSearchApp();
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "zen tabs";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
    );

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "openUrl",
        url: "https://www.google.com/search?q=zen%20tabs",
      }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "switchTab" }));

    render(null, root);
    root.remove();
  });

  it("opens a typed site on Shift+Enter instead of searching it", async () => {
    const { root, sendMessage } = mountSearchApp();
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "youtube.com";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
    );

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "openUrl",
        url: "https://youtube.com/",
      }),
    );

    render(null, root);
    root.remove();
  });

  it("searches with the engine chosen from the search bar", async () => {
    const { root, sendMessage } = mountSearchApp(vi.fn(), tabs, "overlay", {
      searchEngine: "duckduckgo",
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-search-engine']")?.textContent).toContain("DDG"),
    );

    root.querySelector<HTMLButtonElement>("[data-testid='zen-search-engine']")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-search-engine-menu']")).not.toBeNull(),
    );
    const brave = [...root.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']")].find(
      (button) => button.textContent?.includes("Brave"),
    );
    brave!.click();
    await vi.waitFor(() =>
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        displaySettings: expect.objectContaining({ searchEngine: "brave" }),
      }),
    );

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "gitlab";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "openUrl",
        url: "https://search.brave.com/search?q=gitlab",
      }),
    );

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

  it("shows the MCP link and version in the status bar on Dev", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", applyPreset("dev"));

    await vi.waitFor(() => {
      const bar = root.querySelector("[data-testid='zen-status-bar']");
      expect(bar).not.toBeNull();
      expect(bar?.querySelector("[data-testid='zen-mcp-status']")).not.toBeNull();
      expect(bar?.textContent).toContain("v4.0.0");
      expect(bar?.textContent).toContain("Check for updates");
    });
    expect(root.querySelector("[data-stat='tabs']")).toBeNull();

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
      await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

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
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

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

    const timer = root.querySelector("button[aria-label='Show active timers']")!;
    const hosts = root.querySelector<HTMLButtonElement>(
      "button[aria-label='Host overrides for this tab']",
    )!;
    const settings = root.querySelector("button[aria-label='Open display settings']")!;
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
      "button[aria-label='Host overrides for this tab']",
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

    root.querySelector<HTMLButtonElement>("button[aria-label='Open display settings']")?.click();
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

  it("hides spaces and essential tabs in the omnibar until you search", async () => {
    const mixedTabs = [
      { ...tabs[0], title: "Regular tab", active: true },
      { ...tabs[1], essential: true, title: "Pinned mail" },
    ];
    const spaces = [{ id: "space-a", name: "Work", isActive: false }];
    const { root } = mountSearchApp(
      vi.fn(),
      mixedTabs,
      "overlay",
      { hideSpacesInOverlay: true, hideEssentialsInOverlay: true },
      spaces,
    );

    await vi.waitFor(() => expect(root.textContent).toContain("Regular tab"));
    expect(root.textContent).not.toContain("Pinned mail");
    expect(root.textContent).not.toContain("Work");
    expect(root.querySelector("[data-testid='zen-space-section']")).toBeNull();
    expect(root.querySelector("[data-testid='zen-essential-section']")).toBeNull();

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "Pinned";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain("Pinned mail"));

    render(null, root);
    root.remove();
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

  it("keeps the host off essential tiles so the title can use the row", async () => {
    const mixedTabs = [
      {
        ...tabs[0],
        title: "Regular tab",
        active: true,
        workspaceName: "Work",
      },
      {
        ...tabs[1],
        essential: true,
        title: "Substack",
        url: "https://substack.com/inbox",
        workspaceName: "Work",
      },
    ];
    const { root } = mountSearchApp(vi.fn(), mixedTabs, "overlay");

    await vi.waitFor(() => expect(root.textContent).toContain("Substack"));
    const grid = root.querySelector("[data-testid='zen-essential-grid']");
    expect(grid?.classList.contains("zs-essential-grid")).toBe(true);
    const tile = grid?.querySelector("[data-testid='zen-search-item']");
    expect(tile?.getAttribute("data-essential")).toBe("true");
    expect(tile?.textContent).toContain("Substack");
    expect(tile?.textContent).not.toContain("Work");
    expect(tile?.textContent).not.toContain("substack.com");

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
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLSelectElement>("[data-testid='zen-forge-sort']")?.value).toBe(
        "asc",
      ),
    );
    expect(root.querySelector("span[aria-label^='Last opened:']")).not.toBeNull();
    play.mockClear();
    const sort = root.querySelector<HTMLSelectElement>("[data-testid='zen-forge-sort']")!;
    sort.value = "old";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(sort.value).toBe("old"));
    expect(play).toHaveBeenCalledWith("tick");

    const input = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
    input.value = "42";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(root.textContent).toContain("Fix search");
      expect(root.textContent).not.toContain("Improve filters");
    });

    root.querySelector<HTMLButtonElement>("[data-testid='zen-forge-open-project']")?.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "openUrl",
        url: "https://github.com/acme/project",
      }),
    );

    root.querySelector<HTMLButtonElement>("[data-testid='zen-issue-activate']")?.click();
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

  it("switches to an open repository homepage from the project name", async () => {
    const forgeTabs = [
      {
        id: 1,
        title: "Zen-Deck",
        url: "https://github.com/acme/project",
        favIconUrl: "",
        windowId: 1,
        active: false,
      },
      {
        id: 2,
        title: "Fix search",
        url: "https://github.com/acme/project/issues/42",
        favIconUrl: "",
        windowId: 1,
        active: false,
      },
    ];
    const { root, sendMessage, onClose } = mountSearchApp(vi.fn(), forgeTabs, "overlay");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-forge-open-project']")).not.toBeNull(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-forge-open-project']")!.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "switchTab",
        tabId: 1,
        domId: undefined,
      }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "openUrl" }));
    render(null, root);
    root.remove();
  });

  it("marks the current tab in the tab list, and no other row", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay");
    await vi.waitFor(() => expect(root.textContent).toContain("Second tab"));

    const current = [...root.querySelectorAll("[data-testid='zen-search-item'][data-current]")];
    expect(current.map((row) => row.textContent)).toEqual([expect.stringContaining("First tab")]);
    expect(current[0]?.querySelector("[data-testid='zen-now-tag']")).not.toBeNull();
    expect(
      root.querySelectorAll("[data-testid='zen-search-item'] [data-testid='zen-now-tag']"),
    ).toHaveLength(1);
    expect(current[0]?.getAttribute("data-selected")).toBe("true");
    expect(
      current[0]?.querySelector("[data-testid='zen-tab-actions']")?.hasAttribute("data-always"),
    ).toBe(false);
    expect(
      root
        .querySelector("[data-testid='zen-current-tab'] [data-testid='zen-tab-actions']")
        ?.hasAttribute("data-always"),
    ).toBe(true);

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
    expect(stage.style.backdropFilter).toBe("");

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

  it("uses a Spotlight chassis unless fullscreen is on", async () => {
    const spotlight = mountSearchApp(vi.fn(), tabs, "overlay", { fullscreen: false });
    await vi.waitFor(() => expect(spotlight.root.textContent).toContain("First tab"));
    expect(
      spotlight.root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-layout"),
    ).toBe("spotlight");
    expect(
      spotlight.root.querySelector("[data-testid='zen-tab-pane']")?.classList.contains("zs-card"),
    ).toBe(false);
    render(null, spotlight.root);
    spotlight.root.remove();

    const full = mountSearchApp(vi.fn(), tabs, "overlay", { fullscreen: true });
    await vi.waitFor(() => expect(full.root.textContent).toContain("First tab"));
    expect(full.root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-layout")).toBe(
      "fullscreen",
    );
    expect(full.root.querySelector("[data-omnibar]")?.className).not.toContain("rounded");
    expect(
      full.root.querySelector("[data-testid='zen-tab-pane']")?.classList.contains("zs-card"),
    ).toBe(true);
    render(null, full.root);
    full.root.remove();
  });

  it("fades the scrim while sliding the chassis in and out before closing", async () => {
    play.mockClear();
    motionAnimate.mockReset();
    const finishes: (() => void)[] = [];
    motionAnimate.mockImplementation(() => {
      let done!: () => void;
      const finished = new Promise<void>((resolve) => {
        done = resolve;
      });
      finishes.push(done);
      return { stop: vi.fn(() => done()), finished };
    });

    const onClose = vi.fn();
    const { root } = mountSearchApp(onClose, tabs, "overlay", {
      openTransition: "slide-up",
      openTransitionMs: 300,
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-omnibar-stage]")?.getAttribute("data-omnibar-stage")).toBe(
        "open",
      ),
    );
    await vi.waitFor(() => expect(motionAnimate).toHaveBeenCalledTimes(2));
    expect(play).toHaveBeenCalledWith("whoosh-in");
    expect(play).not.toHaveBeenCalledWith("down");

    const scrim = root.querySelector<HTMLElement>("[data-omnibar-scrim]")!;
    const chassis = root.querySelector<HTMLElement>("[data-omnibar]")!;
    expect(motionAnimate).toHaveBeenNthCalledWith(
      1,
      scrim,
      { opacity: [0, 1] },
      expect.objectContaining({ duration: 0.3 }),
    );
    expect(motionAnimate).toHaveBeenNthCalledWith(
      2,
      chassis,
      { opacity: [1, 1], x: [0, 0], y: ["100vh", 0], scale: [1, 1] },
      expect.objectContaining({ duration: 0.3 }),
    );
    finishes.splice(0).forEach((fn) => fn());

    play.mockClear();
    scrim.click();
    await vi.waitFor(() => expect(motionAnimate).toHaveBeenCalledTimes(4));
    expect(play).toHaveBeenCalledWith("whoosh-out");
    expect(play).not.toHaveBeenCalledWith("up");
    expect(onClose).not.toHaveBeenCalled();
    expect(motionAnimate).toHaveBeenNthCalledWith(
      3,
      scrim,
      { opacity: 0 },
      expect.objectContaining({ duration: 0.3 }),
    );
    expect(motionAnimate).toHaveBeenNthCalledWith(
      4,
      chassis,
      { opacity: 1, x: 0, y: "100vh", scale: 1 },
      expect.objectContaining({ duration: 0.3 }),
    );

    finishes.splice(0).forEach((fn) => fn());
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());

    render(null, root);
    root.remove();
  });

  it("whooshes a fade in and out", async () => {
    play.mockClear();
    motionAnimate.mockReset();
    const finishes: (() => void)[] = [];
    motionAnimate.mockImplementation(() => {
      let done!: () => void;
      const finished = new Promise<void>((resolve) => {
        done = resolve;
      });
      finishes.push(done);
      return { stop: vi.fn(() => done()), finished };
    });
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", {
      openTransition: "fade",
      openTransitionMs: 300,
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-omnibar-stage]")?.getAttribute("data-omnibar-stage")).toBe(
        "open",
      ),
    );
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("whoosh-in"));
    play.mockClear();
    root.querySelector<HTMLElement>("[data-omnibar-scrim]")!.click();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("whoosh-out"));
    expect(play).not.toHaveBeenCalledWith("down");
    expect(play).not.toHaveBeenCalledWith("up");
    finishes.splice(0).forEach((fn) => fn());
    render(null, root);
    root.remove();
  });

  it("clicks the overlay open and shut when the transition is none", async () => {
    play.mockClear();
    const onClose = vi.fn();
    const { root } = mountSearchApp(onClose, tabs, "overlay", { openTransition: "none" });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-omnibar-stage]")?.getAttribute("data-omnibar-stage")).toBe(
        "open",
      ),
    );
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("down"));
    expect(play).not.toHaveBeenCalledWith("whoosh-in");

    play.mockClear();
    root.querySelector<HTMLElement>("[data-omnibar-scrim]")!.click();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("up"));
    expect(play).not.toHaveBeenCalledWith("whoosh-out");
    expect(onClose).toHaveBeenCalledOnce();

    render(null, root);
    root.remove();
  });

  it("shows a preloaded deck again without asking for another snapshot", async () => {
    const { root, sendMessage } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [],
      [],
      { kind: "search", query: "gitlab" },
      [],
      false,
      0,
    );
    const snapshots = () =>
      sendMessage.mock.calls.filter((call) => call[0]?.type === "getSnapshot").length;
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")?.value).toBe(
        "gitlab",
      ),
    );
    await vi.waitFor(() => expect(snapshots()).toBe(1));
    const before = snapshots();

    render(<SearchApp onClose={vi.fn()} layout="overlay" reveal={1} />, root);

    await vi.waitFor(() =>
      expect(root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")?.value).toBe(
        "",
      ),
    );
    expect(snapshots()).toBe(before);
    render(null, root);
    root.remove();
  });

  it("reopens from its session cache on the first frame, before the snapshot returns", async () => {
    const { root, sendMessage } = mountSearchApp(vi.fn(), tabs, "overlay");
    const cache = createSearchSessionCache();
    render(<SearchApp onClose={vi.fn()} layout="overlay" cache={cache} />, root);
    await vi.waitFor(() =>
      expect(root.querySelector("[data-omnibar-stage]")?.getAttribute("data-omnibar-stage")).toBe(
        "open",
      ),
    );
    render(null, root);

    // The reopened search's own snapshot read never finishes.
    sendMessage.mockImplementation(() => new Promise(() => undefined));
    render(<SearchApp onClose={vi.fn()} layout="overlay" cache={cache} />, root);

    expect(root.textContent).toContain("First tab");
    expect(root.querySelector("[data-omnibar-stage]")?.getAttribute("data-omnibar-stage")).toBe(
      "open",
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "getSnapshot" });

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

  it("keeps todo order and highlights the current tab in its place", async () => {
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
    expect(todoRows()[0]?.textContent).toContain("Second tab");
    expect(todoRows()[0]?.querySelector("[data-testid='zen-now-tag']")).toBeNull();
    expect(todoRows()[1]?.textContent).toContain("First tab");
    expect(todoRows()[1]?.getAttribute("data-current")).toBe("true");
    expect(todoRows()[1]?.querySelector("[data-testid='zen-now-tag']")).not.toBeNull();
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

  it("opens a todo from a still click anywhere on the row", async () => {
    const { root, sendMessage, onClose } = mountSearchApp(
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
      expect(root.querySelectorAll("[data-testid='zen-todo-row']")).toHaveLength(2),
    );
    const row = root.querySelector<HTMLElement>("[data-testid='zen-todo-row']")!;
    row.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        pointerId: 1,
        bubbles: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    expect(root.querySelector("[data-testid='zen-todo-column']")?.className).not.toContain(
      "select-none",
    );
    row.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "switchTab", tabId: 1, domId: undefined }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    render(null, root);
    root.remove();
  });

  it("reorders todos from Motion Reorder and remembers the order", async () => {
    const { root, sendMessage } = mountSearchApp(
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
      expect(root.querySelectorAll("[data-testid='zen-todo-row']")).toHaveLength(2),
    );
    expect(root.querySelector("[data-testid='zen-todo-drag']")).toBeNull();
    const row = root.querySelector<HTMLElement>("[data-testid='zen-todo-row']")!;
    motionReorder.dragStart = vi.fn();
    row.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        pointerId: 1,
        bubbles: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    expect(root.querySelector("[data-testid='zen-todo-column']")?.className).not.toContain(
      "select-none",
    );
    row.dispatchEvent(
      new PointerEvent("pointermove", {
        button: 0,
        pointerId: 1,
        bubbles: true,
        clientX: 10,
        clientY: 24,
      }),
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.className).toContain(
        "select-none",
      ),
    );
    expect(motionReorder.dragStart).toHaveBeenCalled();
    row.click();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "switchTab" }));
    motionReorder.onReorder?.([2, 1]);
    await vi.waitFor(() => {
      const rows = [...root.querySelectorAll("[data-testid='zen-todo-row']")];
      expect(rows[0]?.textContent).toContain("Second tab");
      expect(rows[1]?.textContent).toContain("First tab");
    });
    expect(browser.storage.local.set).toHaveBeenCalledWith({ todoOrder: [2, 1] });

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

    // The empty hardware key has a dot indicator; the checked one has a tick.
    expect(button().querySelector("[data-checkbox-indicator]")).not.toBeNull();
    expect(button().querySelector("[data-checkbox-tick]")).toBeNull();
    button().click();
    await vi.waitFor(() => expect(button().getAttribute("aria-pressed")).toBe("true"));
    expect(button().querySelector("[data-checkbox-indicator]")).toBeNull();
    expect(button().querySelector("[data-checkbox-tick]")).not.toBeNull();

    render(null, root);
    root.remove();
  });

  it("copies a tab's URL from its row action and from the context menu", async () => {
    const { root, writeText } = mountSearchApp(vi.fn(), tabs, "overlay");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-copy-link-button']")).not.toBeNull(),
    );

    root.querySelector<HTMLButtonElement>("[data-testid='zen-copy-link-button']")!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("https://example.com"));

    writeText.mockClear();
    root.querySelector("[data-testid='zen-search-item']")!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-copy-link-menu']")).not.toBeNull(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-copy-link-menu']")!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("https://example.com"));
    expect(root.querySelector("[data-testid='zen-tab-context-menu']")).toBeNull();

    render(null, root);
    root.remove();
  });

  it("lists search prefixes in a hovercard next to the query", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay");
    const help = () => root.querySelector("[data-testid='zen-search-help']");
    await vi.waitFor(() => expect(help()).not.toBeNull());
    help()!.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.waitFor(() =>
      expect(root.querySelector("[role='tooltip']")?.textContent).toContain("@"),
    );
    const tip = root.querySelector("[role='tooltip']")!.textContent ?? "";
    expect(tip).toContain("#");
    expect(tip).toContain("!");
    expect(tip).toContain("-Hide matches");
    expect(tip).toContain("Todos");
    expect(tip).toContain("Hide matches");

    render(null, root);
    root.remove();
  });

  it("does not tooltip the todo column's Mark as done label", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [{ tabId: 2, status: "todo" }],
    );
    const done = () => root.querySelector("[data-testid='zen-todo-done-button']");
    await vi.waitFor(() => expect(done()).not.toBeNull());
    done()!.dispatchEvent(new MouseEvent("mouseenter"));
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(root.querySelector("[role='tooltip']")).toBeNull();

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
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("print-8"));
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
    const issueLine = issue()!.querySelector(".zs-row-line")!;
    const issueMeta = issueLine.querySelector(".zs-meta")!;
    const issueLamp = issueLine.querySelector(".zs-todo-dot")!;
    expect(issueLamp).not.toBeNull();
    expect(
      issueMeta.compareDocumentPosition(issueLamp) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

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
      "Copy link",
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
    const clear = () => root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear']")!;
    await vi.waitFor(() => expect(clear()).toBeTruthy());
    clear().click();
    const menu = () => root.querySelector("[data-testid='zen-todo-clear-menu']");
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Mark done and close"));
    expect(menu()?.textContent).toContain("All");
    expect(menu()?.textContent).toContain("Red");
    expect(
      root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear-done-orange']")?.disabled,
    ).toBe(true);

    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear-done-red']")!.click();

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
    const clear = () => root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear']")!;
    await vi.waitFor(() => expect(clear()).toBeTruthy());
    clear().click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-clear-done-all']")).toBeTruthy(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear-done-all']")!.click();

    const prompt = () => root.querySelector("[data-testid='zen-todo-clear-confirm']");
    await vi.waitFor(() => expect(prompt()?.textContent).toContain("Mark 1 todo as done?"));
    expect(root.querySelector("[data-testid='zen-todo-clear-menu']")).toBeNull();

    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear-cancel-button']")!.click();
    await vi.waitFor(() => expect(prompt()).toBeNull());
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "clearTodos" }));
    expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).toContain(
      "First tab",
    );

    render(null, root);
    root.remove();
  });

  it("closes the cleared tabs when the confirm is Done & close", async () => {
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
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-clear']")).toBeTruthy(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear']")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-clear-close-all']")).toBeTruthy(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-todo-clear-close-all']")!.click();

    const prompt = () => root.querySelector("[data-testid='zen-todo-clear-confirm']");
    await vi.waitFor(() =>
      expect(prompt()?.textContent).toContain("Mark 2 todos as done and close their tabs?"),
    );
    const confirmButton = root.querySelector<HTMLButtonElement>(
      "[data-testid='zen-todo-clear-confirm-button']",
    )!;
    expect(confirmButton.textContent).toBe("Done & close");
    confirmButton.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    confirmButton.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "clearTodos",
        tabIds: [1, 2],
        close: true,
      }),
    );

    render(null, root);
    root.remove();
  });

  it("puts the todo lamp after the host, at the end of the row", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      undefined,
      [],
      [{ tabId: 1, status: "todo" }],
    );
    await vi.waitFor(() => expect(root.querySelector(".zs-todo-dot")).not.toBeNull());
    const line = root.querySelector("[data-testid='zen-search-item'] .zs-row-line")!;
    const meta = line.querySelector(".zs-meta")!;
    const lamp = line.querySelector(".zs-todo-dot")!;
    expect(meta.compareDocumentPosition(lamp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

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
      expect(root.querySelector("[data-testid='zen-issue-activate']")).not.toBeNull(),
    );
    root.querySelector("[data-testid='zen-issue-activate']")!.dispatchEvent(
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
    expect(menu()).toBeTruthy();
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Mark as done"));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")?.textContent).toContain(
        "Fix search",
      ),
    );

    render(null, root);
    root.remove();
  });

  it("keeps the context menu open after marking a todo so a status color can still be set", async () => {
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
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Mark as todo"));

    [...menu()!.querySelectorAll("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Mark as todo"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "setTodo", tabId: 1, status: "todo" }),
    );
    expect(menu()).toBeTruthy();

    menu()!.querySelector<HTMLButtonElement>("[data-traffic-light='green']")!.click();
    await vi.waitFor(() => expect(menu()).toBeNull());
    expect(sendMessage).toHaveBeenCalledWith({ type: "setTabStatus", tabId: 1, light: "green" });

    render(null, root);
    root.remove();
  });

  it("hides disabled features from the tab context menu", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", {
      todos: false,
      statusColors: false,
      timers: false,
      hosts: false,
      copyLink: false,
    });
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
    await vi.waitFor(() => expect(menu()?.textContent).toContain("Close tab"));
    expect(menu()?.textContent).not.toContain("Mark as todo");
    expect(menu()?.querySelector("[aria-label='Status']")).toBeNull();
    expect(menu()?.textContent).not.toContain("Timer");
    expect(menu()?.textContent).not.toContain("Host overrides");
    expect(menu()?.querySelector("[data-testid='zen-copy-link-menu']")).toBeNull();

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

  it("keeps the current issue tab in the navigator as well as the strip", async () => {
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
    // Like a normal current tab, the current issue stays in its list too.
    const entries = [...root.querySelectorAll("[data-testid='zen-issue-entry']")];
    expect(entries.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining("Older issue"),
      expect.stringContaining("Newer issue"),
    ]);
    // And it is marked there, so it can be found with every folder open.
    const current = [...root.querySelectorAll("[data-testid='zen-issue-entry'][data-current]")];
    expect(current.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining("Older issue"),
    ]);
    expect(current[0]?.querySelector("[data-testid='zen-now-tag']")).not.toBeNull();
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
  const sendMessage = vi.fn(async ({ type }: { type: string }) => {
    if (type === "getSnapshot") {
      return { tabs: snapshotTabs, spaces: [], timers, statuses: [] };
    }
    if (type === "getTodos") {
      return todos;
    }
    if (type === "organizeForgeIssueTabs") {
      return { foldersCreated: 1, tabsMoved: snapshotTabs.length, skipped: 0 };
    }
    if (type === "getUpdateStatus") {
      return {
        currentVersion: "4.0.0",
        latest: null,
        updateAvailable: false,
        demo: false,
        canInstall: true,
        checkedAt: null,
      };
    }
    if (type === "getBridgeStatus") {
      return { connected: false };
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
          get: vi.fn(async () => ({
            displaySettings: {
              ...DEFAULT_DISPLAY_SETTINGS,
              ...applyPreset("dev"),
              ...displaySettings,
            },
            complexitySetupDone: true,
            ...stored,
          })),
          set,
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    },
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  const onClose = vi.fn();
  render(<SearchApp onClose={onClose} layout="overlay" />, root);
  const input = () => root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']")!;
  const press = (key: string, init: KeyboardEventInit = {}) =>
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  const unmount = () => {
    render(null, root);
    root.remove();
  };
  return { root, set, sendMessage, input, press, unmount, onClose };
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
    (element) => element.getAttribute("data-issue-url") ?? "",
  );

const selectedUrl = (root: HTMLElement) =>
  root.querySelector("[data-issue-selected='true']")?.getAttribute("data-issue-url") ?? "";

const radios = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLButtonElement>("[role='radio']"),
];

function folder(root: HTMLElement, label: string) {
  const match = [...root.querySelectorAll<HTMLElement>("[data-testid='zen-issue-folder']")].find(
    (element) => {
      const trigger = element.querySelector(".zs-tree-trigger");
      const text = `${trigger?.querySelector(".zs-tree-label")?.textContent ?? ""}${
        trigger?.querySelector(".zs-tree-chip")?.textContent ?? ""
      }`;
      return text.trim() === label;
    },
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

  it("confirms organizing tabs into folders and can skip the prompt", async () => {
    const { root, sendMessage, set, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-organize-forge']")).not.toBeNull(),
    );

    root.querySelector<HTMLButtonElement>("[data-testid='zen-organize-forge']")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-organize-forge-menu']")).not.toBeNull(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-organize-forge-tree']")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-organize-forge-confirm']")).not.toBeNull(),
    );
    expect(root.textContent).toContain("Create folders matching this list");

    const skip = root.querySelector<HTMLInputElement>(
      "[data-testid='zen-organize-forge-dont-ask']",
    )!;
    skip.checked = true;
    skip.dispatchEvent(new Event("change", { bubbles: true }));
    root
      .querySelector<HTMLButtonElement>("[data-testid='zen-organize-forge-confirm-button']")!
      .click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "organizeForgeIssueTabs",
        mode: "tree",
        tabIds: expect.any(Array),
      }),
    );
    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          displaySettings: expect.objectContaining({ confirmOrganizeForgeTabs: false }),
        }),
      ),
    );
    unmount();
  });

  it("previews each organize mode as an ASCII tree on hover", async () => {
    const { root, unmount } = mountOverlay({ snapshotTabs: forgeSnapshotTabs() });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-organize-forge']")).not.toBeNull(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-organize-forge']")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-organize-forge-menu']")).not.toBeNull(),
    );

    const tree = root.querySelector<HTMLButtonElement>("[data-testid='zen-organize-forge-tree']")!;
    tree.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-testid='zen-organize-forge-preview']")?.textContent,
      ).toContain("└─ branch"),
    );
    expect(
      root.querySelector("[data-testid='zen-organize-forge-preview']")?.textContent,
    ).not.toContain("#12 Title");

    root
      .querySelector<HTMLButtonElement>("[data-testid='zen-organize-forge-by-issue']")!
      .dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-testid='zen-organize-forge-preview']")?.textContent,
      ).toContain("#12 Title"),
    );
    unmount();
  });

  it("organizes by issue without a prompt when confirmation is off", async () => {
    const { root, sendMessage, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
      displaySettings: { confirmOrganizeForgeTabs: false },
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-organize-forge']")).not.toBeNull(),
    );

    root.querySelector<HTMLButtonElement>("[data-testid='zen-organize-forge']")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-organize-forge-menu']")).not.toBeNull(),
    );
    root.querySelector<HTMLButtonElement>("[data-testid='zen-organize-forge-by-issue']")!.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "organizeForgeIssueTabs",
        mode: "byIssue",
        tabIds: expect.any(Array),
      }),
    );
    expect(root.querySelector("[data-testid='zen-organize-forge-confirm']")).toBeNull();
    unmount();
  });

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
    expect(button().closest(".zs-head")?.textContent).toContain("Ascending");

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

  it("keeps the current request in view, and only it, when its groups are collapsed", async () => {
    const snapshotTabs = forgeSnapshotTabs().map((tab) =>
      tab.id === 7 ? { ...tab, active: true } : tab,
    );
    // Entries outside a folded panel; a closed panel keeps its rows mounted but inert.
    const shownUrls = (root: HTMLElement) =>
      [...root.querySelectorAll<HTMLElement>("[data-testid='zen-issue-entry']")]
        .filter((element) => !element.closest("[inert]"))
        .map((element) => element.getAttribute("data-issue-url") ?? "");

    const branch = mountOverlay({
      snapshotTabs,
      stored: { forgeCollapsedGroups: [`branch:gitlab:${GITLAB}:main`] },
    });
    await vi.waitFor(() => expect(shownUrls(branch.root)).toHaveLength(4));
    expect(shownUrls(branch.root).filter((url) => url.includes("/merge_requests/"))).toEqual([
      expect.stringContaining("/merge_requests/7"),
      expect.stringContaining("/merge_requests/8"),
    ]);
    branch.unmount();

    const project = mountOverlay({
      snapshotTabs,
      stored: { forgeCollapsedGroups: [`project:gitlab:${GITLAB}`] },
    });
    await vi.waitFor(() =>
      expect(shownUrls(project.root)).toEqual([expect.stringContaining("/merge_requests/7")]),
    );
    project.unmount();
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
    expect(root.querySelector(".zs-tree-bar .zs-acc-count")?.textContent).toBe("5");
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
    // Plain Left moves the caret; only Alt+Left collapses.
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

  it("docks soonest and upcoming timers on fullscreen, and the header still swaps the full list", async () => {
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
      expect(root.querySelector("[data-testid='zen-todo-column']")).not.toBeNull(),
    );
    const dock = root.querySelector("[data-testid='zen-timers-dock']");
    expect(dock).not.toBeNull();
    expect(dock?.textContent).toContain("Soonest timer");
    expect(dock?.textContent).toContain("Later timer");
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-aspect")).toBe("3/2");
    root.querySelector<HTMLButtonElement>("button[aria-label='Show active timers']")!.click();
    await vi.waitFor(() => expect(root.textContent).toContain("Active timers"));
    expect(root.textContent).toContain("Soonest timer");
    expect(root.textContent).toContain("Later timer");
    unmount();
  });

  it("lists every timer in the swapped timer view", async () => {
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
      expect(root.querySelector("button[aria-label='Show active timers']")).not.toBeNull(),
    );
    expect(root.querySelector("[data-testid='zen-timers-dock']")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("button[aria-label='Show active timers']")!.click();
    await vi.waitFor(() => expect(root.textContent).toContain("Echo"));
    expect(root.textContent).toContain("Alpha");
    expect(root.textContent).toContain("Delta");
    unmount();
  });

  it("switches to a timer's tab from the swapped timer list", async () => {
    const { root, sendMessage, onClose, unmount } = mountOverlay({
      snapshotTabs: tabs,
      todos: [{ tabId: 1, status: "todo" }],
      timers: [
        {
          timerId: "soon",
          tabId: 2,
          endAt: Date.now() + 5 * 60 * 1000,
          title: "Soonest timer",
          originalLabel: "",
          url: "",
        },
        {
          timerId: "later",
          tabId: 1,
          endAt: Date.now() + 60 * 60 * 1000,
          title: "Later timer",
          originalLabel: "",
          url: "",
        },
      ],
    });
    await vi.waitFor(() =>
      expect(root.querySelector("button[aria-label='Show active timers']")).not.toBeNull(),
    );
    root.querySelector<HTMLButtonElement>("button[aria-label='Show active timers']")!.click();
    await vi.waitFor(() => expect(root.textContent).toContain("Active timers"));

    const soonest = root.querySelector<HTMLElement>("[data-testid='zen-timers-dock-soonest']")!;
    soonest.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.waitFor(() =>
      expect(root.querySelector("[role='tooltip']")?.textContent).toBe("Go to this tab"),
    );

    soonest.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: "switchTab",
        tabId: 2,
        domId: undefined,
      }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
  });

  it("gives fullscreen timers their own column when there are no todos", async () => {
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
    expect(root.querySelector("[data-testid='zen-timers-dock']")?.textContent).toContain(
      "Only timer",
    );
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

  it("keeps the timers dock off Spotlight", async () => {
    const { root, unmount } = mountOverlay({
      snapshotTabs: tabs,
      displaySettings: applyPreset("enhanced"),
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
      expect(root.querySelector("button[aria-label='Show active timers']")).not.toBeNull(),
    );
    expect(root.querySelector("[data-testid='zen-timers-dock']")).toBeNull();
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-layout")).toBe(
      "spotlight",
    );
    unmount();
  });

  it("ticks when Ctrl+wheel steps the overlay font size, like the font size slider", async () => {
    const { root, set, unmount } = mountOverlay({
      snapshotTabs: tabs,
      displaySettings: { soundEnabled: true, fontSize: 14 },
    });
    await vi.waitFor(() => expect(root.querySelector("[data-zen-ui]")).not.toBeNull());

    const overlay = root.querySelector<HTMLElement>("[data-zen-ui]")!;
    const wheel = (deltaY: number) => {
      const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
      // happy-dom's WheelEvent ignores ctrlKey in the init dict.
      Object.defineProperty(event, "ctrlKey", { configurable: true, value: true });
      overlay.dispatchEvent(event);
    };
    await vi.waitFor(() => {
      wheel(-100);
      expect(play).toHaveBeenCalledWith("tick");
    });
    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: expect.objectContaining({ fontSize: 15 }),
      }),
    );

    play.mockClear();
    overlay.dispatchEvent(
      new WheelEvent("wheel", { ctrlKey: true, deltaY: 0, bubbles: true, cancelable: true }),
    );
    expect(play).not.toHaveBeenCalled();

    unmount();
  });

  it("plays key sounds from event handlers when sound is on", async () => {
    const { root, press, unmount } = mountOverlay({
      snapshotTabs: forgeSnapshotTabs(),
      displaySettings: { soundEnabled: true },
    });
    await vi.waitFor(() => expect(entryUrls(root)).toHaveLength(5));
    // Opening the overlay clicks; typing stays silent until a key.
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("whoosh-in"));
    play.mockClear();

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

    strip(root)!
      .querySelector("span.zs-row-title")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
      root.querySelector<HTMLButtonElement>("button[aria-label='Host overrides for this tab']")!;
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
      root.querySelector<HTMLButtonElement>("button[aria-pressed][aria-label*='timers']")!;
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

describe("complexity flags", () => {
  it("Simple hides timer and copy chrome and uses Spotlight", async () => {
    const { root } = mountSearchApp(vi.fn(), tabs, "overlay", applyPreset("simple"));
    await vi.waitFor(() => expect(root.textContent).toContain("First tab"));
    expect(root.querySelector("button[aria-label='Show active timers']")).toBeNull();
    expect(root.querySelector("[data-testid='zen-copy-link-button']")).toBeNull();
    expect(root.querySelector("[data-testid='zen-current-tab']")).toBeNull();
    expect(root.querySelector("[data-testid='zen-status-bar']")).toBeNull();
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-layout")).toBe(
      "spotlight",
    );
    expect(root.querySelector("[data-testid='zen-tab-pane']")?.classList.contains("zs-card")).toBe(
      false,
    );
    render(null, root);
    root.remove();
  });

  it("Simple shows the status bar only when an update is available", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      applyPreset("simple"),
      [],
      [],
      [],
      undefined,
      [],
      true,
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-status-bar']")?.textContent).toContain(
        "There is a new version available",
      ),
    );
    expect(root.querySelector("[data-testid='zen-mcp-status']")).toBeNull();
    expect(root.querySelector("[data-testid='zen-update-check']")).toBeNull();
    render(null, root);
    root.remove();
  });

  it("filters the tab list with ! when the forge tree is off", async () => {
    const forgeTabs: Partial<TabInfo>[] = [
      {
        id: 1,
        title: "Improve search",
        url: "https://github.com/example/zen-deck/pull/45",
        favIconUrl: "",
        windowId: 1,
        active: true,
      },
      {
        id: 2,
        title: "Fix results",
        url: "https://github.com/example/zen-deck/issues/123",
        favIconUrl: "",
        windowId: 1,
      },
      {
        id: 3,
        title: "Architecture guide",
        url: "https://docs.example.com/architecture",
        favIconUrl: "",
        windowId: 1,
      },
    ];
    const { root } = mountSearchApp(vi.fn(), forgeTabs, "overlay", applyPreset("simple"));
    const input = await vi.waitFor(() => {
      const field = root.querySelector<HTMLInputElement>("[data-testid='zen-search-input']");
      expect(field).not.toBeNull();
      return field!;
    });
    input.value = "!";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(root.textContent).toContain("Improve search");
      expect(root.textContent).not.toContain("Architecture guide");
      expect(root.textContent).not.toContain("Fix results");
    });
    render(null, root);
    root.remove();
  });

  it("Pro shows the todo column", async () => {
    const { root } = mountSearchApp(
      vi.fn(),
      tabs,
      "overlay",
      applyPreset("pro"),
      [],
      [{ tabId: 2, status: "todo" }],
    );
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-todo-column']")).not.toBeNull(),
    );
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-layout")).toBe(
      "fullscreen",
    );
    render(null, root);
    root.remove();
  });

  it("shows a detached first-run card on Simple until Continue", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        runtime: {
          sendMessage: vi.fn(async () => ({
            tabs,
            spaces: [],
            timers: [],
            todos: [],
            statuses: [],
          })),
          onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        },
        storage: {
          local: {
            get: vi.fn(async () => ({})),
            set,
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<SearchApp onClose={vi.fn()} layout="overlay" reveal={1} />, root);
    await vi.waitFor(() => expect(root.textContent).toContain("Pick a preset"));
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-layout")).toBe("setup");
    expect(root.querySelector("[data-testid='zen-search-input']")).toBeNull();
    expect(
      root.querySelector("[data-testid='zen-complexity-continue']")?.closest(".overflow-y-auto"),
    ).toBeNull();
    const slider = root.querySelector<HTMLInputElement>("[data-testid='zen-complexity-preset']")!;
    expect(slider.value).toBe("0");
    expect(slider.max).toBe("3");
    const transition = root.querySelector<HTMLSelectElement>(
      "[data-testid='zen-setup-open-transition']",
    )!;
    expect(transition.value).toBe("fade");
    expect(
      transition.compareDocumentPosition(
        root.querySelector("[data-testid='zen-complexity-continue']")!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    slider.value = "3";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(slider.value).toBe("3"));
    expect(slider.getAttribute("aria-valuetext")).toBe("DEV");
    expect(root.querySelector(".zs-mod-meta")).toBeNull();
    expect(root.querySelector("[data-testid='zen-search-input']")).toBeNull();
    expect(root.querySelector("[data-omnibar]")?.getAttribute("data-omnibar-layout")).toBe("setup");

    const transitionAfter = root.querySelector<HTMLSelectElement>(
      "[data-testid='zen-setup-open-transition']",
    )!;
    play.mockClear();
    motionAnimate.mockClear();
    transitionAfter.value = "zoom";
    transitionAfter.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(transitionAfter.value).toBe("zoom"));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-omnibar-stage]")?.getAttribute("data-open-transition")).toBe(
        "zoom",
      ),
    );
    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: expect.objectContaining({ openTransition: "zoom" }),
      }),
    );
    expect(motionAnimate).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalledWith("whoosh-in");

    motionAnimate.mockClear();
    play.mockClear();
    render(<SearchApp onClose={vi.fn()} layout="overlay" reveal={2} />, root);
    await vi.waitFor(() => expect(root.textContent).toContain("Pick a preset"));
    await vi.waitFor(() => expect(motionAnimate).toHaveBeenCalled());
    expect(motionAnimate).toHaveBeenCalledWith(
      root.querySelector("[data-omnibar]"),
      { opacity: [1, 1], x: [0, 0], y: [0, 0], scale: [0, 1] },
      expect.objectContaining({ duration: 0.15 }),
    );
    expect(play).toHaveBeenCalledWith("whoosh-in");

    root.querySelector<HTMLButtonElement>("[data-testid='zen-complexity-continue']")!.click();
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith({ complexitySetupDone: true }));
    expect(set).toHaveBeenCalledWith({
      displaySettings: expect.objectContaining({ openTransition: "zoom" }),
    });
    await vi.waitFor(() =>
      expect(root.querySelector("[data-testid='zen-search-input']")).not.toBeNull(),
    );
    render(null, root);
    root.remove();
  });
});
