import type { JSX } from "preact";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it } from "vitest";
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

function Harness({ query, onRender }: { query: string; onRender: (nav: Navigation) => void }) {
  const navigation = useSearchNavigation({
    layout: "overlay",
    query,
    pageJump: 5,
    items,
    navigatorEntries: [],
    todoTabs,
    forgeNavigatorQuery: parseForgeNavigatorQuery(query),
    todoNavigatorQuery: parseTodoNavigatorQuery(query),
    bestForgeIndex: 0,
    bestTabWordCount: 0,
    bestForgeWordCount: 0,
    onClose: () => undefined,
    onActivateItem: () => undefined,
    onActivateForgeEntry: () => undefined,
    onActivateTodoTab: () => undefined,
  });
  onRender(navigation);
  return null;
}

function mount() {
  let latest: Navigation | undefined;
  const root = document.createElement("div");
  const onRender = (nav: Navigation) => {
    latest = nav;
  };
  const show = (query: string) =>
    act(() => {
      render(h(Harness, { query, onRender }), root);
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

function press(nav: Navigation, key: string) {
  act(() => {
    nav.onKeyDown({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: () => undefined,
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
});
