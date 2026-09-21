import { useMemo } from "preact/hooks";
import {
  bestForgeNavigatorIndex,
  buildForgeIssueEntries,
  buildSearchItems,
  excludePinnedSearchSources,
  filterSearchItems,
  flattenForgeNavigatorEntries,
  groupSearchItems,
  parseForgeNavigatorQuery,
  prioritizeCurrentTab,
  rankForgeIssueEntries,
  type ForgeIssueSortMode,
} from "@/features/search/model/ranking";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import type { SearchLayout } from "@/features/search/ui/types";
import { tabBrowserId, type SpaceInfo, type TabInfo } from "@/shared/types";

export interface UseSearchResultsOptions {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  essentialNames: Record<string, string>;
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

  const forgeNavigatorQuery = useMemo(() => parseForgeNavigatorQuery(query), [query]);

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

  const navigatorEntries = useMemo(
    () => flattenForgeNavigatorEntries(filteredForgeIssueEntries, forgeSortMode),
    [filteredForgeIssueEntries, forgeSortMode],
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

  const items = useMemo(() => {
    const effectiveQuery = forgeNavigatorQuery.active ? forgeNavigatorQuery.filterQuery : query;
    const matches = filterSearchItems(
      buildSearchItems(searchable.tabs, searchable.spaces),
      effectiveQuery,
    );
    if (effectiveQuery.trim()) {
      return matches;
    }
    const activeId = searchable.tabs.find(
      (tab) => tab.active === true && tabBrowserId(tab) !== undefined,
    )?.id;
    return prioritizeCurrentTab(matches, activeId);
  }, [forgeNavigatorQuery, query, searchable]);

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
    rankedForgeIssueEntries,
    filteredForgeIssueEntries,
    navigatorEntries,
    bestForgeIndex,
    items,
    itemIndices,
    itemGroups,
  };
}
