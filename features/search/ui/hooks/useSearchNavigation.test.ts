import type { JSX } from "preact";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import { parseForgeNavigatorQuery, parseTodoNavigatorQuery } from "@/features/search/model/ranking";
import { useSearchNavigation } from "@/features/search/ui/hooks/useSearchNavigation";
import type { SearchItem, TabInfo } from "@/shared/types";

function tab(id: number): TabInfo {
  return {
    id,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    favIconUrl: "",
    windowId: 1,
    active: false,
  };
}

const items: SearchItem[] = [{ kind: "tab", data: tab(1) }];
const todoTabs = [tab(2)];

type Navigation = ReturnType<typeof useSearchNavigation>;

function Harness({
  query,
  list = items,
  onRender,
  onWebSearch,
  onActivateItem,
}: {
  query: string;
  list?: SearchItem[];
  onRender: (nav: Navigation) => void;
  onWebSearch?: () => void;
  onActivateItem?: () => void;
}) {
  const navigation = useSearchNavigation({
    layout: "overlay",
    query,
    pageJump: 5,
    items: list,
    navigatorEntries: [],
    todoTabs,
    forgeNavigatorQuery: parseForgeNavigatorQuery(query),
    todoNavigatorQuery: parseTodoNavigatorQuery(query),
    bestForgeIndex: 0,
    bestTabWordCount: 0,
    bestForgeWordCount: 0,
    onClose: () => undefined,
    onActivateItem: onActivateItem ?? (() => undefined),
    onActivateForgeEntry: () => undefined,
    onActivateTodoTab: () => undefined,
    onWebSearch,
  });
  onRender(navigation);
  return null;
}

function mount(
  options: { onWebSearch?: () => void; onActivateItem?: () => void; list?: SearchItem[] } = {},
) {
  let latest: Navigation | undefined;
  const root = document.createElement("div");
  const onRender = (nav: Navigation) => {
    latest = nav;
  };
  const show = (query: string) =>
    act(() => {
      render(h(Harness, { query, onRender, ...options }), root);
    });
  return {
    show,
    nav: () => {
      if (!latest) throw new Error("Harness has not rendered.");
      return latest;
    },
    unmount: () => render(null, root),
  };
}

function press(
  nav: Navigation,
  key: string,
  init: { shiftKey?: boolean; ctrlKey?: boolean; preventDefault?: () => void } = {},
) {
  act(() => {
    nav.onKeyDown({
      key,
      ctrlKey: init.ctrlKey === true,
      metaKey: false,
      altKey: false,
      shiftKey: init.shiftKey === true,
      preventDefault: init.preventDefault ?? (() => undefined),
    } as unknown as JSX.TargetedKeyboardEvent<HTMLInputElement>);
  });
}

describe("useSearchNavigation", () => {
  it("hands the keyboard back to the tab list when a prefix is deleted", () => {
    const { show, nav, unmount } = mount();
    show("");
    expect(nav().activePane).toBe("tabs");

    press(nav(), "@");
    show("@");
    expect(nav().activePane).toBe("todos");

    show("");
    expect(nav().activePane).toBe("tabs");
    unmount();
  });

  it("searches the web on Shift+Enter instead of activating a tab", () => {
    const onWebSearch = vi.fn();
    const onActivateItem = vi.fn();
    const { show, nav, unmount } = mount({ onWebSearch, onActivateItem });
    show("zen tabs");
    press(nav(), "Enter", { shiftKey: true });
    expect(onWebSearch).toHaveBeenCalledOnce();
    expect(onActivateItem).not.toHaveBeenCalled();
    unmount();
  });

  it("jumps five rows with Ctrl+Up and Ctrl+Down, and leaves Left and Right for the caret", () => {
    const list: SearchItem[] = Array.from({ length: 12 }, (_, index) => ({
      kind: "tab",
      data: tab(index + 1),
    }));
    const { show, nav, unmount } = mount({ list });
    show("");
    expect(nav().selectedIndex).toBe(0);

    const preventJump = vi.fn();
    press(nav(), "ArrowDown", { ctrlKey: true, preventDefault: preventJump });
    expect(nav().selectedIndex).toBe(5);
    expect(preventJump).toHaveBeenCalledOnce();

    const preventLeft = vi.fn();
    press(nav(), "ArrowLeft", { preventDefault: preventLeft });
    expect(nav().selectedIndex).toBe(5);
    expect(preventLeft).not.toHaveBeenCalled();

    press(nav(), "ArrowRight");
    expect(nav().selectedIndex).toBe(5);

    press(nav(), "ArrowUp", { ctrlKey: true });
    expect(nav().selectedIndex).toBe(0);

    press(nav(), "ArrowUp", { ctrlKey: true });
    expect(nav().selectedIndex).toBe(0);
    unmount();
  });
});
