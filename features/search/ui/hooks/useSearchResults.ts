import { useMemo } from "preact/hooks";
import {
  countForgeEntriesByKind,
  filterForgeEntriesByKind,
  forgeRequestsLabel,
  hidesForgeEntryInOverlay,
  type ForgeKindFilter,
} from "@/features/forge/model/forge-filter";
import {
  openedForgeCollapsed,
  type ForgeCollapsedSet,
} from "@/features/forge/model/forge-collapse";
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
  pinnedFirst,
  rankForgeIssueEntries,
  type ForgeIssueSortMode,
} from "@/features/search/model/ranking";
import {
  activeCollapsedFolders,
  isUnderCollapsedFolder,
} from "@/features/search/model/tab-folder-collapse";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import type { SearchLayout } from "@/features/search/ui/types";
import { collectTodoTabs } from "@/features/todos/model/todo";
import type { SpaceInfo, TabInfo, TabTodo } from "@/shared/types";

export interface UseSearchResultsOptions {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  essentialNames: Record<string, string>;
  todos: Map<number, TabTodo>;
  displaySettings: DisplaySettings;
  layout: SearchLayout;
  query: string;
  forgeSortMode: ForgeIssueSortMode;
  /** Which kinds of issue-navigator entry are listed. */
  forgeKindFilter?: ForgeKindFilter;
  /** Keys of the navigator groups the user collapsed; their entries leave the keyboard order. */
  forgeCollapsed?: ForgeCollapsedSet;
  /** Collapsed tab folders, by `tabFolderKey`; ignored while a query is active. */
  tabFolderCollapsed?: ReadonlySet<string>;
}

/**
 * Everything derived from the raw snapshot plus the current query: the labelled
 * tab list, the forge entries, the ranked/filtered result set and its grouping.
 */
/** A stable empty set, so an absent prop does not rebuild every memo. */
const NO_COLLAPSED_FOLDERS: ReadonlySet<string> = new Set();

export function useSearchResults({
  tabs,
  spaces,
  essentialNames,
  todos,
  displaySettings,
  layout,
  query,
  forgeSortMode,
  forgeKindFilter = "all",
  forgeCollapsed,
  tabFolderCollapsed,
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
    if (layout !== "overlay" || !displaySettings.forgeTree) {
      return labeledTabs;
    }
    const hiddenTabs = new Set(
      allForgeEntries
        .filter((entry) => hidesForgeEntryInOverlay(entry, displaySettings))
        .map((entry) => entry.tab),
    );
    return hiddenTabs.size === 0 ? labeledTabs : labeledTabs.filter((tab) => !hiddenTabs.has(tab));
  }, [allForgeEntries, displaySettings, labeledTabs, layout]);

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

  /** `#` and `!` pick a kind; otherwise the All / Issues / MRs control does. */
  const effectiveKindFilter: ForgeKindFilter = forgeNavigatorQuery.kind ?? forgeKindFilter;

  const forgeTreeCollapsed = useMemo(
    () =>
      openedForgeCollapsed(
        forgeCollapsed ?? new Set(),
        forgeNavigatorQuery.active ? effectiveKindFilter : undefined,
      ),
    [effectiveKindFilter, forgeCollapsed, forgeNavigatorQuery.active],
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

  // The current tab's issue stays in the navigator as well as in the strip under
  // the search bar, as a normal current tab stays in its folder.
  const restBeforeKind = filteredForgeIssueEntries;

  // The kind tabs count what the query left, before the kind filter narrows it.
  const forgeKindCounts = useMemo(() => countForgeEntriesByKind(restBeforeKind), [restBeforeKind]);

  const requestsLabel = useMemo(() => forgeRequestsLabel(forgeIssueEntries), [forgeIssueEntries]);

  const listedForgeIssueEntries = useMemo(
    () => filterForgeEntriesByKind(restBeforeKind, effectiveKindFilter),
    [effectiveKindFilter, restBeforeKind],
  );

  /** The tab the overlay was opened over, whatever the query or filters. */
  const currentTab = useMemo(() => labeledTabs.find((tab) => tab.active === true), [labeledTabs]);

  const currentTabForgeEntry = useMemo(
    () => (currentTab ? forgeIssueEntries.find((entry) => entry.tab === currentTab) : undefined),
    [currentTab, forgeIssueEntries],
  );

  // What the arrow keys walk: the visible entries only, so a hidden or
  // collapsed one can never be selected.
  const navigatorEntries = useMemo(
    () => flattenForgeNavigatorEntries(listedForgeIssueEntries, forgeSortMode, forgeTreeCollapsed),
    [forgeTreeCollapsed, forgeSortMode, listedForgeIssueEntries],
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

  // A navigator prefix hands the keyboard to another column; the rest of the
  // query still filters the tab list.
  const effectiveQuery =
    forgeNavigatorQuery.active || todoNavigatorQuery.active
      ? forgeNavigatorQuery.filterQuery
      : query;

  const searchable = useMemo(() => {
    const forgeTabs =
      forgeNavigatorQuery.active && !displaySettings.forgeTree
        ? visibleTabs.filter((tab) => listedForgeIssueEntries.some((entry) => entry.tab === tab))
        : visibleTabs;
    return excludePinnedSearchSources(forgeTabs, spaces, {
      excludeSpaces: displaySettings.hideSpacesInOverlay,
      excludeEssentials: displaySettings.hideEssentialsInOverlay,
      query: effectiveQuery,
    });
  }, [
    displaySettings,
    effectiveQuery,
    forgeNavigatorQuery.active,
    listedForgeIssueEntries,
    spaces,
    visibleTabs,
  ]);

  const searchDocuments = useMemo(
    () => buildSearchDocuments(buildSearchItems(searchable.tabs, searchable.spaces)),
    [searchable],
  );

  const filtered = useMemo(() => {
    const matches = filterSearchDocuments(searchDocuments, effectiveQuery);
    if (effectiveQuery.trim()) {
      return matches;
    }
    return { items: pinnedFirst(matches.items), bestExactWordCount: 0 };
  }, [effectiveQuery, searchDocuments]);

  // What a query matched, and the part of it the list shows: rows under a collapsed
  // folder stay in the folder's count but are not rows, so no key can select them.
  // The current tab is the exception and stays selectable in its folder.
  const matchedItems = filtered.items;
  const collapsedFolders = useMemo(
    () =>
      activeCollapsedFolders(tabFolderCollapsed ?? NO_COLLAPSED_FOLDERS, {
        query: effectiveQuery,
        groupFolders: displaySettings.groupFolders,
      }),
    [displaySettings.groupFolders, effectiveQuery, tabFolderCollapsed],
  );
  const items = useMemo(
    () =>
      collapsedFolders.size === 0
        ? matchedItems
        : matchedItems.filter(
            (item) =>
              !isUnderCollapsedFolder(item, collapsedFolders, displaySettings.groupSubfolders),
          ),
    [collapsedFolders, displaySettings.groupSubfolders, matchedItems],
  );
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
      groupSearchItems(matchedItems, {
        groupFolders: displaySettings.groupFolders,
        groupSubfolders: displaySettings.groupSubfolders,
      }),
    [displaySettings.groupFolders, displaySettings.groupSubfolders, matchedItems],
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
    effectiveKindFilter,
    forgeTreeCollapsed,
    currentTab,
    currentTabForgeEntry,
    forgeKindCounts,
    requestsLabel,
    navigatorEntries,
    bestForgeIndex,
    items,
    matchedItems,
    collapsedFolders,
    bestTabWordCount,
    bestForgeWordCount,
    itemIndices,
    itemGroups,
  };
}
