import { useMemo } from "preact/hooks";
import {
  bestForgeNavigatorIndex,
  buildForgeIssueEntries,
  buildSearchDocuments,
  buildSearchItems,
  excludePinnedSearchSources,
  filterSearchDocuments,
  filterTodoTabs,
  flattenForgeNavigatorEntries,
  groupSearchItems,
  parseForgeNavigatorQuery,
  parseTodoNavigatorQuery,
  prioritizeCurrentTab,
  rankForgeIssueEntries,
  splitCurrentForgeEntry,
  type ForgeIssueSortMode,
} from "@/features/search/model/ranking";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import type { SearchLayout } from "@/features/search/ui/types";
import { collectTodoTabs } from "@/features/todos/model/todo";
import { tabBrowserId, type SpaceInfo, type TabInfo, type TabTodo } from "@/shared/types";

export interface UseSearchResultsOptions {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  essentialNames: Record<string, string>;
  todos: Map<number, TabTodo>;
  displaySettings: DisplaySettings;
  layout: SearchLayout;
  query: string;
  forgeSortMode: ForgeIssueSortMode;
}

/**
 * Everything derived from the raw snapshot plus the current query: the labelled
 * tab list, the forge entries, the ranked/filtered result set and its grouping.
 */
export function useSearchResults({
  tabs,
  spaces,
  essentialNames,
  todos,
  displaySettings,
  layout,
  query,
  forgeSortMode,
}: UseSearchResultsOptions) {
  // Essential tabs carry an extension-local name rather than a Zen label.
  const labeledTabs = useMemo(
    () =>
      tabs.map((tab) => {
        const essentialName = tab.domId ? essentialNames[tab.domId] : undefined;
        return essentialName ? { ...tab, customLabel: essentialName } : tab;
      }),
    [essentialNames, tabs],
  );

  // Computed over every tab regardless of the setting, so `visibleTabs` can
  // reuse it instead of re-parsing each tab's URL one array at a time.
  const allForgeEntries = useMemo(() => buildForgeIssueEntries(labeledTabs), [labeledTabs]);

  const forgeIssueEntries = useMemo(
    () => (displaySettings.detectForgeIssues ? allForgeEntries : []),
    [allForgeEntries, displaySettings.detectForgeIssues],
  );

  const visibleTabs = useMemo(() => {
    if (!(layout === "overlay" && displaySettings.filterIssuesInOverlay)) {
      return labeledTabs;
    }
    const issueTabs = new Set(allForgeEntries.map((entry) => entry.tab));
    return labeledTabs.filter((tab) => !issueTabs.has(tab));
  }, [allForgeEntries, displaySettings.filterIssuesInOverlay, labeledTabs, layout]);

  // "@" sends the keyboard to the todo column; the rest of the query still
  // filters the tab list and the issue navigator, as "!" and "#" do.
  const todoNavigatorQuery = useMemo(() => parseTodoNavigatorQuery(query), [query]);

  const forgeNavigatorQuery = useMemo(
    () =>
      todoNavigatorQuery.active
        ? { active: false, filterQuery: todoNavigatorQuery.filterQuery }
        : parseForgeNavigatorQuery(query),
    [query, todoNavigatorQuery],
  );

  /** Every todo tab, whatever the query; decides whether the column is shown at all. */
  const allTodoTabs = useMemo(() => collectTodoTabs(labeledTabs, todos), [labeledTabs, todos]);

  const todoTabs = useMemo(
    () =>
      todoNavigatorQuery.active
        ? filterTodoTabs(allTodoTabs, todoNavigatorQuery.filterQuery)
        : allTodoTabs,
    [allTodoTabs, todoNavigatorQuery],
  );

  const rankedForgeIssueEntries = useMemo(
    () => rankForgeIssueEntries(forgeIssueEntries, forgeNavigatorQuery.filterQuery),
    [forgeIssueEntries, forgeNavigatorQuery.filterQuery],
  );

  const filteredForgeIssueEntries = useMemo(
    () =>
      forgeNavigatorQuery.filterQuery.trim()
        ? rankedForgeIssueEntries.map(({ entry }) => entry)
        : forgeIssueEntries,
    [forgeIssueEntries, forgeNavigatorQuery.filterQuery, rankedForgeIssueEntries],
  );

  // With issue tabs kept out of the tab list, the current tab can only show up
  // here, so it is listed first, as the tab list does, until a query re-ranks.
  const { current: currentForgeEntry, rest: listedForgeIssueEntries } = useMemo(
    () =>
      layout === "overlay" &&
      displaySettings.filterIssuesInOverlay &&
      !forgeNavigatorQuery.filterQuery.trim()
        ? splitCurrentForgeEntry(filteredForgeIssueEntries)
        : { current: undefined, rest: filteredForgeIssueEntries },
    [
      displaySettings.filterIssuesInOverlay,
      filteredForgeIssueEntries,
      forgeNavigatorQuery.filterQuery,
      layout,
    ],
  );

  const navigatorEntries = useMemo(
    () => flattenForgeNavigatorEntries(listedForgeIssueEntries, forgeSortMode, currentForgeEntry),
    [currentForgeEntry, forgeSortMode, listedForgeIssueEntries],
  );

  const bestForgeIndex = useMemo(
    () =>
      bestForgeNavigatorIndex(
        navigatorEntries,
        rankedForgeIssueEntries,
        forgeNavigatorQuery.filterQuery,
      ),
    [forgeNavigatorQuery.filterQuery, navigatorEntries, rankedForgeIssueEntries],
  );

  const searchable = useMemo(() => {
    const popup = layout === "popup";
    return excludePinnedSearchSources(visibleTabs, spaces, {
      excludeSpaces: popup
        ? displaySettings.hideSpacesInPopup
        : displaySettings.hideSpacesInOverlay,
      excludeEssentials: popup
        ? displaySettings.hideEssentialsInPopup
        : displaySettings.hideEssentialsInOverlay,
    });
  }, [displaySettings, layout, spaces, visibleTabs]);

  const searchDocuments = useMemo(
    () => buildSearchDocuments(buildSearchItems(searchable.tabs, searchable.spaces)),
    [searchable],
  );

  const filtered = useMemo(() => {
    const effectiveQuery =
      forgeNavigatorQuery.active || todoNavigatorQuery.active
        ? forgeNavigatorQuery.filterQuery
        : query;
    const matches = filterSearchDocuments(searchDocuments, effectiveQuery);
    if (effectiveQuery.trim()) {
      return matches;
    }
    const activeId = searchable.tabs.find(
      (tab) => tab.active === true && tabBrowserId(tab) !== undefined,
    )?.id;
    return {
      items: prioritizeCurrentTab(matches.items, activeId),
      bestExactWordCount: 0,
    };
  }, [forgeNavigatorQuery, query, searchable, searchDocuments, todoNavigatorQuery.active]);

  const items = filtered.items;
  const bestTabWordCount = filtered.bestExactWordCount;
  const bestForgeWordCount = useMemo(() => {
    if (!forgeNavigatorQuery.filterQuery.trim()) {
      return 0;
    }
    return rankedForgeIssueEntries.reduce((max, entry) => Math.max(max, entry.words), 0);
  }, [forgeNavigatorQuery.filterQuery, rankedForgeIssueEntries]);

  // Position of each item in the flat list, so rows can look up their index
  // without an indexOf scan per row while rendering nested groups.
  const itemIndices = useMemo(() => new Map(items.map((item, index) => [item, index])), [items]);

  const itemGroups = useMemo(
    () =>
      groupSearchItems(items, {
        groupFolders: displaySettings.groupFolders,
        groupSubfolders: displaySettings.groupSubfolders,
      }),
    [displaySettings.groupFolders, displaySettings.groupSubfolders, items],
  );

  return {
    labeledTabs,
    forgeIssueEntries,
    visibleTabs,
    forgeNavigatorQuery,
    todoNavigatorQuery,
    allTodoTabs,
    todoTabs,
    rankedForgeIssueEntries,
    listedForgeIssueEntries,
    currentForgeEntry,
    navigatorEntries,
    bestForgeIndex,
    items,
    bestTabWordCount,
    bestForgeWordCount,
    itemIndices,
    itemGroups,
  };
}
