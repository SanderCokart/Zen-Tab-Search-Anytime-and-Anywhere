import type { JSX } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  FORGE_NAVIGATOR_PREFIXES,
  TODO_NAVIGATOR_PREFIXES,
  type NavigatorQuery,
} from "@/features/search/model/ranking";
import type { SearchLayout } from "@/features/search/ui/types";
import type { SearchItem, TabInfo } from "@/shared/types";
import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";

export type SearchPane = "tabs" | "forge" | "todos";

export interface UseSearchNavigationOptions {
  layout: SearchLayout;
  query: string;
  pageJump: number;
  items: SearchItem[];
  navigatorEntries: ForgeIssueEntry[];
  todoTabs: TabInfo[];
  forgeNavigatorQuery: NavigatorQuery;
  todoNavigatorQuery: NavigatorQuery;
  bestForgeIndex: number;
  bestTabWordCount: number;
  bestForgeWordCount: number;
  onClose: () => void;
  onActivateItem: (item: SearchItem) => void;
  onActivateForgeEntry: (entry: ForgeIssueEntry) => void;
  onActivateTodoTab: (tab: TabInfo) => void;
}

function isPrefixKey(prefixes: readonly string[], key: string): boolean {
  return prefixes.includes(key);
}

function clampIndex(index: number, count: number): number {
  return count > 0 && index >= 0 && index < count ? index : 0;
}

/**
 * Owns which pane (tab list, forge navigator, or todo column) has the keyboard,
 * which row is selected in it, and how arrow/tab/enter keys move between them.
 *
 * The pane is chosen automatically from the query until the user overrides it
 * with Tab or by clicking; a pane override is tied to the query that created it
 * and is ignored as soon as the query changes — no extra layout commit.
 */
export function useSearchNavigation({
  layout,
  query,
  pageJump,
  items,
  navigatorEntries,
  todoTabs,
  forgeNavigatorQuery,
  todoNavigatorQuery,
  bestForgeIndex,
  bestTabWordCount,
  bestForgeWordCount,
  onClose,
  onActivateItem,
  onActivateForgeEntry,
  onActivateTodoTab,
}: UseSearchNavigationOptions) {
  const [paneOverride, setPaneOverride] = useState<{ query: string; pane: SearchPane } | null>(
    null,
  );
  const [tabSelection, setTabSelection] = useState<{ query: string; index: number }>({
    query: "",
    index: -1,
  });
  const [forgeSelection, setForgeSelection] = useState<{ query: string; index: number }>({
    query: "",
    index: 0,
  });
  const [todoSelection, setTodoSelection] = useState<{ query: string; index: number }>({
    query: "",
    index: 0,
  });
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const canFocusForge = layout === "overlay" && navigatorEntries.length > 0;
  const canFocusTodos = layout === "overlay" && todoTabs.length > 0;
  const canFocusTabs = items.length > 0;
  const searchQuery = forgeNavigatorQuery.filterQuery.trim();

  // "@" hands the keyboard to the todo column the way "!" and "#" hand it to
  // the issue navigator.
  const shouldFocusTodoQuery = canFocusTodos && todoNavigatorQuery.active;

  const shouldFocusForge =
    canFocusForge &&
    !todoNavigatorQuery.active &&
    (forgeNavigatorQuery.active ||
      (Boolean(searchQuery) && bestForgeWordCount > 0 && bestForgeWordCount >= bestTabWordCount));

  // With no query, a current tab that is a todo starts highlighted in the todo
  // column, where it is listed first, rather than in the tab list.
  const shouldFocusCurrentTodo = canFocusTodos && !query.trim() && todoTabs[0]?.active === true;

  const userPane = paneOverride?.query === query ? paneOverride.pane : null;

  const panes: SearchPane[] = [
    ...(canFocusTabs ? (["tabs"] as const) : []),
    ...(canFocusForge ? (["forge"] as const) : []),
    ...(canFocusTodos ? (["todos"] as const) : []),
  ];

  const activePane: SearchPane =
    userPane === "tabs" && canFocusTabs
      ? "tabs"
      : userPane === "forge" && canFocusForge
        ? "forge"
        : userPane === "todos" && canFocusTodos
          ? "todos"
          : shouldFocusTodoQuery || shouldFocusCurrentTodo
            ? "todos"
            : shouldFocusForge
              ? "forge"
              : canFocusTabs
                ? "tabs"
                : canFocusForge
                  ? "forge"
                  : canFocusTodos
                    ? "todos"
                    : "tabs";

  const defaultTabIndex = (): number => {
    if (activePane !== "tabs" || !items.length) {
      return -1;
    }
    if (!query.trim()) {
      const currentTabIndex = items.findIndex((item) => item.kind === "tab" && item.data.active);
      return currentTabIndex >= 0 ? currentTabIndex : 0;
    }
    return shouldFocusForge ? -1 : 0;
  };

  const selectedIndex =
    tabSelection.query === query && tabSelection.index >= 0 && tabSelection.index < items.length
      ? tabSelection.index
      : defaultTabIndex();

  const selectedForgeIndex =
    forgeSelection.query === query
      ? clampIndex(forgeSelection.index, navigatorEntries.length)
      : shouldFocusForge && searchQuery
        ? bestForgeIndex
        : 0;

  const selectedTodoIndex =
    todoSelection.query === query ? clampIndex(todoSelection.index, todoTabs.length) : 0;

  const focusForgePane = (index: number) => {
    setPaneOverride({ query, pane: "forge" });
    setForgeSelection({ query, index });
    setTabSelection({ query, index: -1 });
  };
  const focusTabsPane = (index: number) => {
    setPaneOverride({ query, pane: "tabs" });
    setTabSelection({ query, index });
  };
  const focusTodosPane = (index: number) => {
    setPaneOverride({ query, pane: "todos" });
    setTodoSelection({ query, index });
    setTabSelection({ query, index: -1 });
  };

  const focusPane = (pane: SearchPane) => {
    if (pane === "tabs") {
      focusTabsPane(clampIndex(selectedIndex, items.length));
    } else if (pane === "forge") {
      focusForgePane(clampIndex(selectedForgeIndex, navigatorEntries.length));
    } else {
      focusTodosPane(clampIndex(selectedTodoIndex, todoTabs.length));
    }
  };

  useEffect(() => {
    optionRefs.current = [];
  }, [items]);

  useEffect(() => {
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    // Focus at once so keys typed straight after Alt+F reach the input rather
    // than the page; the delayed retry covers the toolbar popup, which can
    // take focus back while it opens. An inert input leaves focus with the
    // panel that made it inert, such as the timer form's When field.
    const focusInput = () => {
      const input = inputRef.current;
      if (input && !input.hasAttribute("inert")) input.focus();
    };
    focusInput();
    const timer = window.setTimeout(focusInput, 100);
    return () => window.clearTimeout(timer);
  }, []);

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
    const count = items.length;
    const forgeCount = navigatorEntries.length;
    const todoCount = todoTabs.length;
    const prefixPane: SearchPane | null =
      canFocusForge && isPrefixKey(FORGE_NAVIGATOR_PREFIXES, event.key)
        ? "forge"
        : canFocusTodos && isPrefixKey(TODO_NAVIGATOR_PREFIXES, event.key)
          ? "todos"
          : null;

    if (event.key === "Escape") {
      onClose();
      event.preventDefault();
    } else if (event.key === "Tab" && panes.length > 1) {
      event.preventDefault();
      const currentIndex = panes.indexOf(activePane);
      const offset = event.shiftKey ? -1 : 1;
      const next = panes[(currentIndex + offset + panes.length) % panes.length];
      if (next) {
        focusPane(next);
      }
    } else if (
      prefixPane &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (inputRef.current?.selectionStart ?? 0) === 0
    ) {
      if (prefixPane === "forge") {
        focusForgePane(0);
      } else {
        focusTodosPane(0);
      }
    } else if (event.key === "Enter") {
      if (activePane === "forge") {
        const selectedForge = navigatorEntries[selectedForgeIndex];
        if (selectedForge) {
          onActivateForgeEntry(selectedForge);
        }
      } else if (activePane === "todos") {
        const selectedTodo = todoTabs[selectedTodoIndex];
        if (selectedTodo) {
          onActivateTodoTab(selectedTodo);
        }
      } else {
        const selected = items[selectedIndex];
        if (selected) {
          onActivateItem(selected);
        }
      }
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      if (activePane === "forge") {
        setForgeSelection({ query, index: (selectedForgeIndex + 1) % forgeCount });
      } else if (activePane === "todos") {
        setTodoSelection({ query, index: (selectedTodoIndex + 1) % todoCount });
      } else if (count) {
        setTabSelection({ query, index: (selectedIndex + 1) % count });
      }
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      if (activePane === "forge") {
        setForgeSelection({
          query,
          index: selectedForgeIndex <= 0 ? forgeCount - 1 : selectedForgeIndex - 1,
        });
      } else if (activePane === "todos") {
        setTodoSelection({
          query,
          index: selectedTodoIndex <= 0 ? todoCount - 1 : selectedTodoIndex - 1,
        });
      } else if (count) {
        setTabSelection({ query, index: selectedIndex <= 0 ? count - 1 : selectedIndex - 1 });
      }
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      if (activePane === "forge") {
        setForgeSelection({
          query,
          index: Math.min(selectedForgeIndex + pageJump, forgeCount - 1),
        });
      } else if (activePane === "todos") {
        setTodoSelection({
          query,
          index: Math.min(selectedTodoIndex + pageJump, todoCount - 1),
        });
      } else if (count) {
        setTabSelection({ query, index: Math.min(selectedIndex + pageJump, count - 1) });
      }
      event.preventDefault();
    } else if (event.key === "ArrowLeft") {
      if (activePane === "forge") {
        setForgeSelection({ query, index: Math.max(selectedForgeIndex - pageJump, 0) });
      } else if (activePane === "todos") {
        setTodoSelection({ query, index: Math.max(selectedTodoIndex - pageJump, 0) });
      } else if (count) {
        setTabSelection({ query, index: Math.max(selectedIndex - pageJump, 0) });
      }
      event.preventDefault();
    }
  };

  const registerOption = useCallback((index: number, element: HTMLLIElement | null) => {
    optionRefs.current[index] = element;
  }, []);

  return {
    inputRef,
    selectedIndex,
    selectedForgeIndex,
    selectedTodoIndex,
    setSelectedForgeIndex: (index: number) => setForgeSelection({ query, index }),
    setSelectedTodoIndex: focusTodosPane,
    activePane,
    onKeyDown,
    registerOption,
  };
}
