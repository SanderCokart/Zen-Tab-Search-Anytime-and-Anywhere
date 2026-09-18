import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  forgeEntryExactWordCount,
  searchItemExactWordCount,
} from "@/features/search/model/ranking";
import type { SearchLayout } from "@/features/search/ui/types";
import type { SearchItem } from "@/shared/types";
import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";

export interface UseSearchNavigationOptions {
  layout: SearchLayout;
  query: string;
  pageJump: number;
  items: SearchItem[];
  navigatorEntries: ForgeIssueEntry[];
  forgeNavigatorQuery: { active: boolean; filterQuery: string };
  bestForgeIndex: number;
  onClose: () => void;
  onActivateItem: (item: SearchItem) => void;
  onActivateForgeEntry: (entry: ForgeIssueEntry) => void;
}

/**
 * Owns which pane (tab list or forge navigator) has the keyboard, which row is
 * selected in it, and how arrow/tab/enter keys move between them.
 *
 * The pane is chosen automatically from the query until the user overrides it
 * with Tab or by clicking; `userPane` records that override and is cleared on
 * the next query change.
 */
export function useSearchNavigation({
  layout,
  query,
  pageJump,
  items,
  navigatorEntries,
  forgeNavigatorQuery,
  bestForgeIndex,
  onClose,
  onActivateItem,
  onActivateForgeEntry,
}: UseSearchNavigationOptions) {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedForgeIndex, setSelectedForgeIndex] = useState(0);
  const [userPane, setUserPane] = useState<"tabs" | "forge" | null>(null);
  const autoQueryRef = useRef(query);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const canFocusForge = layout === "overlay" && navigatorEntries.length > 0;
  const canFocusTabs = items.length > 0;
  const searchQuery = forgeNavigatorQuery.filterQuery.trim();

  // With a query present, prefer whichever pane has the stronger exact-word hit.
  const bestForgeWordCount = searchQuery
    ? Math.max(0, ...navigatorEntries.map((entry) => forgeEntryExactWordCount(entry, searchQuery)))
    : 0;
  const bestTabWordCount = searchQuery
    ? Math.max(0, ...items.map((item) => searchItemExactWordCount(item, searchQuery)))
    : 0;
  const shouldFocusForge =
    canFocusForge &&
    (forgeNavigatorQuery.active ||
      (Boolean(searchQuery) && bestForgeWordCount > 0 && bestForgeWordCount >= bestTabWordCount));

  const navigateForge =
    userPane === "tabs"
      ? false
      : userPane === "forge"
        ? canFocusForge
        : shouldFocusForge || (!canFocusTabs && canFocusForge);

  const focusForgePane = (index: number) => {
    setUserPane("forge");
    setSelectedForgeIndex(index);
    setSelectedIndex(-1);
  };
  const focusTabsPane = (index: number) => {
    setUserPane("tabs");
    setSelectedIndex(index);
  };

  useLayoutEffect(() => {
    const queryChanged = autoQueryRef.current !== query;
    if (queryChanged) {
      autoQueryRef.current = query;
      if (userPane !== null) {
        setUserPane(null);
      }
    }
    if (!queryChanged && userPane !== null) {
      return;
    }
    if (!searchQuery && !forgeNavigatorQuery.active) {
      return;
    }
    if (shouldFocusForge) {
      focusForgePane(searchQuery ? bestForgeIndex : 0);
      return;
    }
    if (queryChanged && canFocusTabs) {
      setSelectedIndex(0);
    }
  }, [
    bestForgeIndex,
    canFocusTabs,
    forgeNavigatorQuery.active,
    query,
    searchQuery,
    shouldFocusForge,
    userPane,
  ]);

  // With no query, keep the current tab selected rather than the first row.
  useEffect(() => {
    optionRefs.current = [];
    if (query.trim()) {
      return;
    }
    setSelectedIndex((current) => {
      if (navigateForge || !items.length) {
        return -1;
      }
      if (current >= 0 && current < items.length) {
        return current;
      }
      const currentTabIndex = items.findIndex((item) => item.kind === "tab" && item.data.active);
      return currentTabIndex >= 0 ? currentTabIndex : 0;
    });
  }, [items, navigateForge, query]);

  useEffect(() => {
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Focus the input shortly after mount; the overlay animates in first.
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, []);

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
    const count = items.length;
    const forgeCount = navigatorEntries.length;

    if (event.key === "Escape") {
      onClose();
      event.preventDefault();
    } else if (event.key === "Tab" && canFocusForge && canFocusTabs) {
      event.preventDefault();
      if (navigateForge) {
        focusTabsPane(selectedIndex >= 0 && selectedIndex < count ? selectedIndex : 0);
      } else {
        focusForgePane(
          selectedForgeIndex >= 0 && selectedForgeIndex < forgeCount ? selectedForgeIndex : 0,
        );
      }
    } else if (
      (event.key === "#" || event.key === "!") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      canFocusForge &&
      (inputRef.current?.selectionStart ?? 0) === 0
    ) {
      focusForgePane(0);
    } else if (event.key === "Enter") {
      if (navigateForge) {
        const selectedForge = navigatorEntries[selectedForgeIndex];
        if (selectedForge) {
          onActivateForgeEntry(selectedForge);
        }
      } else {
        const selected = items[selectedIndex];
        if (selected) {
          onActivateItem(selected);
        }
      }
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      if (navigateForge) {
        setSelectedForgeIndex((selectedForgeIndex + 1) % forgeCount);
      } else if (count) {
        setSelectedIndex((selectedIndex + 1) % count);
      }
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      if (navigateForge) {
        setSelectedForgeIndex(selectedForgeIndex <= 0 ? forgeCount - 1 : selectedForgeIndex - 1);
      } else if (count) {
        setSelectedIndex(selectedIndex <= 0 ? count - 1 : selectedIndex - 1);
      }
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      if (navigateForge) {
        setSelectedForgeIndex(Math.min(selectedForgeIndex + pageJump, forgeCount - 1));
      } else if (count) {
        setSelectedIndex(Math.min(selectedIndex + pageJump, count - 1));
      }
      event.preventDefault();
    } else if (event.key === "ArrowLeft") {
      if (navigateForge) {
        setSelectedForgeIndex(Math.max(selectedForgeIndex - pageJump, 0));
      } else if (count) {
        setSelectedIndex(Math.max(selectedIndex - pageJump, 0));
      }
      event.preventDefault();
    }
  };

  const registerOption = (index: number, element: HTMLLIElement | null) => {
    optionRefs.current[index] = element;
  };

  return {
    inputRef,
    selectedIndex,
    selectedForgeIndex,
    setSelectedForgeIndex,
    navigateForge,
    onKeyDown,
    registerOption,
  };
}
