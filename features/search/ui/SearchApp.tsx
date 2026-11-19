import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  forgeTreeKeys,
  nearestCollapsedGroup,
  groupToCollapse,
} from "@/features/forge/model/forge-collapse";
import type { ForgeKindFilter } from "@/features/forge/model/forge-filter";
import { ForgeIssueNavigator } from "@/features/forge/ui/ForgeIssueNavigator";
import { useForgeCollapse, useStoredCollapse } from "@/features/forge/ui/useForgeCollapse";
import {
  collectTabFolderKeys,
  TAB_FOLDER_COLLAPSED_STORAGE_KEY,
} from "@/features/search/model/tab-folder-collapse";
import {
  flattenForgeNavigatorEntries,
  groupForgeIssueEntries,
  type ForgeIssueSortMode,
} from "@/features/search/model/ranking";
import { pluralize } from "@/features/search/model/stats";
import { TodoNavigator } from "@/features/todos/ui/TodoNavigator";
import { TimersDock } from "@/features/timers/ui/TimersDock";
import {
  TRAFFIC_LIGHT_MENU_SELECTOR,
  TRAFFIC_LIGHT_TRIGGER_SELECTOR,
  TrafficLightMenu,
} from "@/features/status/ui/TrafficLightMenu";
import { CurrentTabStrip } from "@/features/search/ui/components/CurrentTabStrip";
import { ActiveTimersPanel } from "@/features/search/ui/components/ActiveTimersPanel";
import { OmnibarViewPanel } from "@/features/search/ui/components/OmnibarViewPanel";
import { StatusBar } from "@/features/search/ui/components/StatusBar";
import { parsePinnedUrl } from "@/features/search/model/pinned-url";
import { openFromQuery, type SearchEngineId } from "@/features/search/model/web-search";
import { EditPinnedUrlDialog } from "@/features/search/ui/components/EditPinnedUrlDialog";
import { RenameTabDialog } from "@/features/search/ui/components/RenameTabDialog";
import { SearchInput } from "@/features/search/ui/components/SearchInput";
import { SearchResultsList } from "@/features/search/ui/components/SearchResultsList";
import { SearchShell } from "@/features/search/ui/components/SearchShell";
import { TabContextMenu } from "@/features/search/ui/components/TabContextMenu";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { useCloseOnOutsideClick } from "@/features/search/ui/hooks/useCloseOnOutsideClick";
import {
  useDisplaySettings,
  type DisplaySettingsCache,
} from "@/features/search/ui/hooks/useDisplaySettings";
import {
  DEFAULT_DISPLAY_SETTINGS,
  saveDisplaySettings,
} from "@/features/settings/model/display-settings";
import {
  applyPreset,
  COMPLEXITY_SETUP_DONE_KEY,
  type ComplexityFlags,
} from "@/features/settings/model/complexity";
import { ComplexitySetupCard } from "@/features/search/ui/components/ComplexitySetupCard";
import { useOverlayEntrance } from "@/features/search/ui/hooks/useOverlayEntrance";
import { useEssentialTabNames } from "@/features/search/ui/hooks/useEssentialTabNames";
import { useSearchNavigation } from "@/features/search/ui/hooks/useSearchNavigation";
import { useSearchResults } from "@/features/search/ui/hooks/useSearchResults";
import {
  useSearchSnapshot,
  type SearchSnapshotCache,
} from "@/features/search/ui/hooks/useSearchSnapshot";
import { useTabRename } from "@/features/search/ui/hooks/useTabRename";
import { useTimerActions } from "@/features/search/ui/hooks/useTimerActions";
import { useStatusActions } from "@/features/search/ui/hooks/useStatusActions";
import { useTodoActions } from "@/features/search/ui/hooks/useTodoActions";
import { copyText } from "@/features/search/ui/lib/copy-text";
import { stripTimerPrefixFromTab } from "@/features/search/ui/lib/format";
import { primaryButtonClass } from "@/features/search/ui/lib/styles";
import type { SearchLayout } from "@/features/search/ui/types";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { OmnibarView } from "@/shared/messaging/protocol";
import { isActivatableTab, tabBrowserId, type SearchItem, type TabInfo } from "@/shared/types";
import {
  tabMatchesForgeProjectHome,
  type ForgeIssueEntry,
} from "@/features/forge/model/forge-label";
import type { ForgeOrganizeMode } from "@/features/forge/model/forge-tab-organize";
import { cn } from "@/shared/ui/cn";
import { CollapseAllButton } from "@/shared/ui/primitives/CollapseAllButton";
import { Led } from "@/shared/ui/primitives/Led";
import { TipText } from "@/shared/ui/primitives/Tooltip";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { useSoundEngine } from "@/shared/ui/sound/SoundContext";

export type { SearchLayout };

type PanelView = Exclude<OmnibarView, { kind: "search" }>;

export interface SearchAppProps {
  onClose: () => void;
  pageJump?: number;
  layout?: SearchLayout;
  /** The overlay view to open on instead of the tab, issue and todo columns. */
  initialView?: OmnibarView;
  /**
   * Outlives this component, so the next mount paints the last snapshot and
   * display settings at once instead of waiting for fresh ones.
   */
  cache?: SearchSessionCache;
}

export type SearchSessionCache = SearchSnapshotCache & DisplaySettingsCache;

export function createSearchSessionCache(): SearchSessionCache {
  return {};
}

/**
 * The search surface, rendered both as the toolbar popup and as the in-page
 * overlay. State lives in the hooks under `hooks/`; this component wires them
 * to the presentational pieces under `components/`.
 */
export function SearchApp({
  onClose,
  pageJump = 5,
  layout = "popup",
  initialView,
  cache,
}: SearchAppProps) {
  const compact = layout === "popup";
  // The overlay has room to swap its columns for the timer and host override
  // controls; the toolbar popup still opens those in their own windows.
  const swapsViews = layout === "overlay";
  // A search view is no panel: it only fills in the query.
  const initialQuery = initialView?.kind === "search" ? initialView.query : "";
  const [view, setView] = useState<PanelView | undefined>(
    swapsViews && initialView?.kind !== "search" ? initialView : undefined,
  );

  const [query, setQuery] = useState(initialQuery);
  const [forgeSortMode, setForgeSortMode] = useState<ForgeIssueSortMode>("recent");
  const [forgeKindFilter, setForgeKindFilter] = useState<ForgeKindFilter>("all");
  const forgeCollapse = useForgeCollapse();
  const tabFolderCollapse = useStoredCollapse(TAB_FOLDER_COLLAPSED_STORAGE_KEY);
  const [timerTabId, setTimerTabId] = useState<number | null>(null);
  const [showTimers, setShowTimers] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ tab: TabInfo; x: number; y: number } | null>(
    null,
  );

  const [statusMenu, setStatusMenu] = useState<{ tabId: number; x: number; y: number } | null>(
    null,
  );
  const [pinnedUrlDialog, setPinnedUrlDialog] = useState<{
    tab: TabInfo;
    tabId: number;
    value: string;
    error: string | null;
  } | null>(null);

  const {
    tabs,
    spaces,
    timers,
    todos,
    statuses,
    loadError,
    loaded: snapshotLoaded,
    setTabs,
    setTimers,
    setTodos,
    setStatuses,
  } = useSearchSnapshot(cache);
  const { displaySettings, loaded: settingsLoaded, setDisplaySettings } = useDisplaySettings(cache);
  const [setupDone, setSetupDone] = useState(true);
  const [setupDraft, setSetupDraft] = useState<ComplexityFlags>(() => applyPreset("simple"));
  const setupInProgress = layout === "overlay" && !setupDone;

  useEffect(() => {
    if (layout !== "overlay") return;
    let cancelled = false;
    void browser.storage.local
      .get(COMPLEXITY_SETUP_DONE_KEY)
      .then((stored) => {
        if (!cancelled) setSetupDone(stored[COMPLEXITY_SETUP_DONE_KEY] === true);
      })
      .catch((error) => debugError("Could not read complexity setup:", error));
    return () => {
      cancelled = true;
    };
  }, [layout]);
  const { essentialNames, setEssentialNames } = useEssentialTabNames();
  const sound = useSoundEngine({
    enabled: displaySettings.soundEnabled,
    volume: displaySettings.soundVolume,
  });

  const results = useSearchResults({
    tabs,
    spaces,
    essentialNames,
    todos,
    displaySettings,
    layout,
    query,
    forgeSortMode,
    forgeKindFilter,
    forgeCollapsed: forgeCollapse.collapsed,
    tabFolderCollapsed: tabFolderCollapse.collapsed,
  });

  const onTimerFormClose = useCallback(() => setTimerTabId(null), []);
  const timerActions = useTimerActions({
    setTimers,
    onTimerFormClose,
  });

  const rename = useTabRename({ essentialNames, setEssentialNames, setTabs });
  const todoActions = useTodoActions({ setTodos, setStatuses });
  const statusActions = useStatusActions({ setStatuses });
  const todoTabs = results.todoTabs;

  useCloseOnOutsideClick(contextMenu !== null, "[data-testid='zen-tab-context-menu']", () =>
    setContextMenu(null),
  );

  useCloseOnOutsideClick(
    statusMenu !== null,
    `${TRAFFIC_LIGHT_MENU_SELECTOR}, ${TRAFFIC_LIGHT_TRIGGER_SELECTOR}`,
    () => setStatusMenu(null),
  );

  /** The tab the omnibar or popup was opened over, which the header buttons act on. */
  const currentTabId = useMemo(() => {
    const current = tabs.find((tab) => tab.active === true);
    return current ? tabBrowserId(current) : undefined;
  }, [tabs]);

  // In the overlay the host overrides toggle like the timers; the toolbar
  // popup opens them in their own window and has no pressed state.
  const hostsOpen =
    swapsViews &&
    view?.kind === "hosts" &&
    currentTabId !== undefined &&
    view.tabId === currentTabId;
  const openHostOverrides = useCallback(
    (tabId: number) => {
      if (swapsViews) {
        setView({ kind: "hosts", tabId });
        return;
      }
      void sendExtensionMessage({ type: "openHostOverridesPopup", tabId }).catch((error) =>
        debugError("Could not open host overrides:", error),
      );
    },
    [swapsViews],
  );

  const openTimer = useCallback(
    (tabId: number) => {
      if (swapsViews) setView({ kind: "timer", tabId });
      else timerActions.openTimerPopup(tabId);
    },
    [swapsViews, timerActions],
  );

  const openContextMenu = useCallback(
    (tab: TabInfo, event: MouseEvent) => {
      if (!displaySettings.contextMenu) return;
      event.preventDefault();
      setStatusMenu(null);
      setContextMenu({ tab, x: event.clientX, y: event.clientY });
      sound.play("open");
    },
    [displaySettings.contextMenu, sound],
  );

  const toggleStatusMenu = useCallback(
    (tab: TabInfo, anchor: DOMRect) => {
      const tabId = tabBrowserId(tab);
      setContextMenu(null);
      // The status key latches while its menu is open.
      if (tabId !== undefined) sound.play(statusMenu?.tabId === tabId ? "latch-up" : "latch-down");
      setStatusMenu((current) =>
        tabId === undefined || current?.tabId === tabId
          ? null
          : { tabId, x: anchor.left, y: anchor.bottom + 4 },
      );
    },
    [sound, statusMenu],
  );

  const activateTab = useCallback(
    (tabId: number | undefined, domId: string | undefined, label: string) => {
      void sendExtensionMessage({ type: "switchTab", tabId, domId: domId || undefined })
        .then(onClose)
        .catch((error) => debugError(`Could not switch ${label}:`, error));
    },
    [onClose],
  );

  const activateItem = useCallback(
    (item: SearchItem) => {
      if (item.kind === "space") {
        void sendExtensionMessage({ type: "switchSpace", spaceId: item.data.id })
          .then(onClose)
          .catch((error) => debugError("Could not switch space:", error));
        return;
      }
      if (!isActivatableTab(item.data)) return;
      activateTab(tabBrowserId(item.data), item.data.domId, "tab");
    },
    [activateTab, onClose],
  );

  const activateForgeEntry = useCallback(
    (entry: ForgeIssueEntry) => {
      if (!isActivatableTab(entry.tab)) return;
      activateTab(tabBrowserId(entry.tab), entry.tab.domId, "issue tab");
    },
    [activateTab],
  );

  const activateTodoTab = useCallback(
    (tab: TabInfo) => {
      if (!isActivatableTab(tab)) return;
      activateTab(tabBrowserId(tab), tab.domId, "todo tab");
    },
    [activateTab],
  );

  const onToggleTodo = useCallback(
    (tabId: number) => {
      const wasTodo = todos.has(tabId);
      sound.play(wasTodo ? "success" : "mark");
      todoActions.setTodo(tabId, wasTodo ? "none" : "todo");
    },
    [sound, todoActions, todos],
  );

  const onToggleTimerForm = useCallback(
    (tabId: number) => {
      if (timerTabId !== tabId) sound.play("open");
      setTimerTabId((current) => (current === tabId ? null : tabId));
    },
    [sound, timerTabId],
  );

  // Size the overlay to the columns that are actually on screen. Using the
  // detection flag here reserved a second column before any issues existed,
  // so the panel jumped the moment the snapshot arrived.
  const showForgeColumn = displaySettings.forgeTree && results.forgeIssueEntries.length > 0;
  const showTodoColumn = displaySettings.todos && results.allTodoTabs.length > 0;
  // Fullscreen has room for the soonest LCD and the next two. Spotlight keeps
  // timers behind the header key so the card does not grow a third pane.
  const showTimersDock =
    layout === "overlay" && displaySettings.fullscreen && displaySettings.timers && timers.size > 0;
  const showRightColumn = showTodoColumn || showTimersDock;
  const overlayColumns = 1 + (showForgeColumn ? 1 : 0) + (showRightColumn ? 1 : 0);
  const overlayAspect = overlayColumns === 3 ? "2/1" : overlayColumns === 2 ? "3/2" : "1/1";
  const overlayOpen = useOverlayEntrance(
    layout === "overlay",
    settingsLoaded && (setupDone ? snapshotLoaded : true),
  );

  const searchWebRef = useRef(() => undefined as void);
  const navigation = useSearchNavigation({
    layout,
    query,
    pageJump,
    items: results.items,
    navigatorEntries: results.navigatorEntries,
    todoTabs,
    forgeNavigatorQuery: results.forgeNavigatorQuery,
    todoNavigatorQuery: results.todoNavigatorQuery,
    bestForgeIndex: results.bestForgeIndex,
    bestTabWordCount: results.bestTabWordCount,
    bestForgeWordCount: results.bestForgeWordCount,
    onClose,
    onActivateItem: activateItem,
    onActivateForgeEntry: activateForgeEntry,
    onActivateTodoTab: activateTodoTab,
    onWebSearch: () => searchWebRef.current(),
    onForgeGroupKey: (action, entry, index) => {
      const { collapsed, setCollapsed } = forgeCollapse;
      const providers = groupForgeIssueEntries(results.listedForgeIssueEntries, forgeSortMode);
      let key: string | undefined;
      if (action === "collapse") {
        key = entry ? groupToCollapse(entry, collapsed) : undefined;
      } else {
        key = nearestCollapsedGroup(providers, collapsed, index);
      }
      if (!key) return undefined;
      sound.play("tick");
      setCollapsed(key, action === "collapse");
      const next = new Set(collapsed);
      if (action === "collapse") next.add(key);
      else next.delete(key);
      return flattenForgeNavigatorEntries(results.listedForgeIssueEntries, forgeSortMode, next)
        .length;
    },
  });

  searchWebRef.current = () => {
    const typed = navigation.inputRef.current?.value ?? query;
    const url = openFromQuery(displaySettings.searchEngine, typed);
    if (!url) return;
    void sendExtensionMessage({ type: "openUrl", url })
      .then(onClose)
      .catch((error) => debugError("Could not open web search:", error));
  };

  const onSearchEngineChange = (engineId: SearchEngineId) => {
    const next = { ...displaySettings, searchEngine: engineId };
    setDisplaySettings(next);
    void saveDisplaySettings(next).catch((error) =>
      debugError("Could not save search engine:", error),
    );
  };

  const closeView = useCallback(() => {
    setView(undefined);
    navigation.inputRef.current?.focus();
  }, [navigation.inputRef]);

  // Escape always closes the whole search, whatever view, menu or form is
  // open. Embedded panels leave Escape to this handler.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const timersOpen = swapsViews ? view?.kind === "timers" : showTimers;
  const toggleTimers = () => {
    if (swapsViews) setView(view?.kind === "timers" ? undefined : { kind: "timers" });
    else setShowTimers(!showTimers);
  };

  const iconButtonClass = cn(
    primaryButtonClass,
    "inline-flex shrink-0 items-center justify-center p-0",
    "size-[var(--zen-control)]",
  );

  const tabFolderKeys = useMemo(
    () => collectTabFolderKeys(results.itemGroups),
    [results.itemGroups],
  );
  // A "#" or "@" query still filters the tab list with whatever follows the prefix.
  const tabFilter =
    results.forgeNavigatorQuery.active || results.todoNavigatorQuery.active
      ? results.forgeNavigatorQuery.filterQuery
      : query;
  const showTabCollapse =
    layout === "overlay" &&
    displaySettings.groupFolders &&
    tabFilter.trim() === "" &&
    tabFolderKeys.length > 0;
  // Stored keys, not the folders held open so the current tab stays visible.
  const tabsAllCollapsed =
    showTabCollapse && tabFolderKeys.every((key) => tabFolderCollapse.collapsed.has(key));
  const tabCount = results.matchedItems.filter((item) => item.kind === "tab").length;
  const onToggleAllTabs = () => {
    tabFolderCollapse.setKeys(tabsAllCollapsed ? [] : tabFolderKeys);
  };

  const forgeKeys = useMemo(
    () => forgeTreeKeys(groupForgeIssueEntries(results.listedForgeIssueEntries, forgeSortMode)),
    [forgeSortMode, results.listedForgeIssueEntries],
  );
  const showForgeCollapse = forgeKeys.length > 0 && !results.forgeNavigatorQuery.active;
  const forgeAllCollapsed =
    showForgeCollapse && forgeKeys.every((key) => results.forgeTreeCollapsed.has(key));
  const onToggleAllForge = () => {
    forgeCollapse.setKeys(forgeAllCollapsed ? [] : forgeKeys);
  };

  // Fullscreen is a full-bleed chassis with inner cards as panes. Spotlight is
  // already a card, so a nested Tabs card reads as glass on glass.
  const nestedPanes = layout === "overlay" && displaySettings.fullscreen;

  return (
    <SearchShell
      layout={layout}
      onClose={onClose}
      displaySettings={displaySettings}
      aspect={layout === "overlay" ? overlayAspect : "1/1"}
      chassis={setupInProgress ? "setup" : undefined}
      open={layout === "overlay" ? overlayOpen : true}
      sound={sound}
    >
      {setupInProgress ? (
        <ComplexitySetupCard
          settings={{ ...DEFAULT_DISPLAY_SETTINGS, ...setupDraft }}
          onChange={setSetupDraft}
          onContinue={() => {
            const next = { ...displaySettings, ...setupDraft };
            setDisplaySettings(next);
            void saveDisplaySettings(next).catch((error) =>
              debugError("Could not save complexity:", error),
            );
            void browser.storage.local
              .set({ [COMPLEXITY_SETUP_DONE_KEY]: true })
              .catch((error) => debugError("Could not save complexity setup:", error));
            setSetupDone(true);
          }}
        />
      ) : (
        <>
          <div class="mb-[var(--zen-space-5)] flex items-center gap-[var(--zen-space-3)]">
            <SearchInput
              inputRef={navigation.inputRef}
              compact={compact}
              initialValue={initialQuery}
              inert={view?.kind === "timer" || view?.kind === "hosts"}
              searchEngine={displaySettings.searchEngine}
              onSearchEngineChange={onSearchEngineChange}
              onQueryChange={(next) => {
                setQuery(next);
                // Typing goes back to the search the input is for.
                if (view) setView(undefined);
              }}
              onKeyDown={navigation.onKeyDown}
            />
            {displaySettings.timers && (
              <TooltipButton
                label={timersOpen ? "Close active timers" : "Show active timers"}
                tooltip={timersOpen ? "Close timers" : "Timers"}
                class={cn(iconButtonClass, "relative")}
                aria-pressed={timersOpen}
                onClick={toggleTimers}
              >
                <TimerIcon class="size-[var(--zen-icon-md)]" />
                <Led on={timersOpen} />
                {!timersOpen && timers.size > 0 && (
                  <span
                    class={cn(
                      "bg-zen-badge absolute -top-1 -right-1 rounded-full text-center text-white",
                      "min-w-[var(--zen-icon-md)] px-[var(--zen-space-1)]",
                      "text-[length:var(--zen-text-xs)] leading-[var(--zen-icon-md)]",
                    )}
                  >
                    {timers.size}
                  </span>
                )}
              </TooltipButton>
            )}
            {displaySettings.hosts && (
              <TooltipButton
                label="Host overrides for this tab"
                tooltip="Hosts"
                class={cn(iconButtonClass, "relative")}
                aria-pressed={swapsViews ? hostsOpen : undefined}
                disabled={currentTabId === undefined}
                onClick={() => {
                  if (currentTabId === undefined) return;
                  if (hostsOpen) closeView();
                  else openHostOverrides(currentTabId);
                }}
              >
                <span aria-hidden="true" class="text-[length:var(--zen-text-base)]">
                  ⇄
                </span>
                {swapsViews && <Led on={hostsOpen} />}
              </TooltipButton>
            )}
            <TooltipButton
              label="Open display settings"
              tooltip="Settings"
              class={iconButtonClass}
              onClick={() =>
                void sendExtensionMessage({ type: "openSettings" }).catch((error) =>
                  debugError("Could not open settings:", error),
                )
              }
            >
              <span aria-hidden="true" class="text-[length:var(--zen-text-base)]">
                ⚙
              </span>
            </TooltipButton>
          </div>

          {results.currentTab &&
            !(view?.kind === "timer" || view?.kind === "hosts") &&
            (layout !== "overlay" || displaySettings.fullscreen) && (
              <CurrentTabStrip
                tab={results.currentTab}
                forgeEntry={results.currentTabForgeEntry}
                timer={timers.get(currentTabId ?? -1)}
                isTodo={todos.has(currentTabId ?? -1)}
                light={currentTabId === undefined ? undefined : statuses.get(currentTabId)}
                statusMenuOpen={currentTabId !== undefined && statusMenu?.tabId === currentTabId}
                truncate={
                  results.currentTabForgeEntry
                    ? displaySettings.truncateIssueTitles
                    : displaySettings.truncateTabTitles
                }
                compact={compact}
                onContextMenu={openContextMenu}
                onToggleTodo={onToggleTodo}
                onOpenTimer={openTimer}
                onOpenStatusMenu={toggleStatusMenu}
                onClose={onClose}
                displaySettings={displaySettings}
              />
            )}

          {view && (
            <OmnibarViewPanel
              view={view}
              timers={timers}
              onBack={closeView}
              onClearAll={timerActions.clearAllTimers}
              onClearTimer={timerActions.clearTimer}
              onOpenTimer={openTimer}
              onActivateTimer={(tabId) => {
                void sendExtensionMessage({ type: "switchTab", tabId }).then(onClose);
              }}
            />
          )}

          {!swapsViews && showTimers && (
            <ActiveTimersPanel
              timers={timers}
              onClearAll={timerActions.clearAllTimers}
              onClearTimer={timerActions.clearTimer}
              onActivateTimer={(tabId) => {
                void sendExtensionMessage({ type: "switchTab", tabId }).then(onClose);
              }}
            />
          )}

          <div
            class={cn(
              "flex min-h-0 min-w-0 flex-1",
              layout === "overlay" ? "gap-[var(--zen-space-6)]" : "flex-col",
            )}
            data-omnibar-columns
            // Kept mounted under a view so the lists keep their scroll and selection.
            style={view ? { display: "none" } : undefined}
          >
            {/* Scrolls inside the frame, so the status bar stays in view under it. */}
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              <div
                class={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col",
                  nestedPanes && "zs-card p-[var(--zen-space-5)]",
                )}
                data-testid="zen-tab-pane"
              >
                {layout === "overlay" && (
                  <div class="zs-head">
                    <strong class="min-w-0 truncate font-[inherit] font-medium">Tabs</strong>
                    {showTabCollapse ? (
                      <span class="zs-head-split">
                        <span class="zs-head-rule" aria-hidden="true" />
                        <CollapseAllButton
                          collapsed={tabsAllCollapsed}
                          onToggle={onToggleAllTabs}
                          testId="zen-collapse-tabs"
                        />
                        <span class="zs-head-rule" aria-hidden="true" />
                      </span>
                    ) : (
                      <span class="zs-head-rule" aria-hidden="true" />
                    )}
                    <TipText label={pluralize(tabCount, "tab")} class="text-zen-danger shrink-0">
                      <span data-testid="zen-tab-count">{tabCount}</span>
                    </TipText>
                  </div>
                )}
                <ul
                  class={cn(
                    "zen-scroll zs-counter m-0 flex min-h-0 list-none flex-col overflow-y-auto",
                    "gap-[var(--zen-section-gap)]",
                    // Each section takes its share of the section gap as padding.
                    "[&>li]:py-[var(--zen-section-pad)] [&>section>li]:py-[var(--zen-section-pad)]",
                    "flex-1",
                    layout !== "overlay" && "zs-card p-[var(--zen-space-5)]",
                    compact && "min-h-[60px]",
                  )}
                  role="listbox"
                >
                  <SearchResultsList
                    groups={results.itemGroups}
                    itemIndices={results.itemIndices}
                    selectedIndex={navigation.selectedIndex}
                    navigateForge={navigation.activePane !== "tabs"}
                    displaySettings={displaySettings}
                    collapsedFolders={results.collapsedFolders}
                    onToggleFolder={tabFolderCollapse.toggle}
                    timers={timers}
                    todos={todos}
                    statuses={statuses}
                    timerTabId={timerTabId}
                    statusMenuTabId={statusMenu?.tabId ?? null}
                    registerOption={navigation.registerOption}
                    onActivate={activateItem}
                    onContextMenu={openContextMenu}
                    onToggleTodo={onToggleTodo}
                    onToggleTimerForm={onToggleTimerForm}
                    onOpenTimerPopup={openTimer}
                    onSetTimer={timerActions.setTimer}
                    onClearTimer={timerActions.clearTimer}
                    onOpenStatusMenu={toggleStatusMenu}
                  />
                </ul>
              </div>
              {(loadError ||
                (results.matchedItems.length === 0 &&
                  results.visibleTabs.length + spaces.length > 0)) && (
                <div class="text-zen-muted px-1 py-3 text-center text-xs">
                  {loadError || "No tabs or spaces found."}
                </div>
              )}
              {!loadError && tabs.length + spaces.length === 0 && (
                <div class="text-zen-muted px-1 py-3 text-center text-xs">
                  Loading tabs and spaces…
                </div>
              )}
            </div>

            {layout === "overlay" && showForgeColumn && (
              <ForgeIssueNavigator
                entries={results.listedForgeIssueEntries}
                truncate={displaySettings.truncateIssueTitles}
                sortMode={forgeSortMode}
                keyboardEntries={results.navigatorEntries}
                kindFilter={results.effectiveKindFilter}
                kindCounts={results.forgeKindCounts}
                requestsLabel={results.requestsLabel}
                onKindFilterChange={(filter) => {
                  setForgeKindFilter(filter);
                  navigation.setSelectedForgeIndex(0);
                }}
                collapsed={results.forgeTreeCollapsed}
                onToggleGroup={forgeCollapse.toggle}
                allCollapsed={forgeAllCollapsed}
                onToggleAll={showForgeCollapse ? onToggleAllForge : undefined}
                selectedIndex={
                  navigation.activePane === "forge" ? navigation.selectedForgeIndex : -1
                }
                onActivate={activateForgeEntry}
                onOpenProject={(url) => {
                  const tab = tabs.find((item) => tabMatchesForgeProjectHome(item.url, url));
                  if (tab && isActivatableTab(tab)) {
                    activateTab(tabBrowserId(tab), tab.domId, "project tab");
                    return;
                  }
                  void sendExtensionMessage({ type: "openUrl", url })
                    .then(onClose)
                    .catch((error) => debugError("Could not open project:", error));
                }}
                onSelect={navigation.setSelectedForgeIndex}
                onToggleSort={() => {
                  sound.play("tick");
                  setForgeSortMode((current) => (current === "recent" ? "old" : "recent"));
                  navigation.setSelectedForgeIndex(0);
                }}
                onContextMenu={openContextMenu}
                timers={timers}
                todos={todos}
                timerTabId={timerTabId}
                onToggleTodo={onToggleTodo}
                onToggleTimerForm={onToggleTimerForm}
                onOpenTimerPopup={openTimer}
                onSetTimer={timerActions.setTimer}
                onClearTimer={timerActions.clearTimer}
                statuses={statuses}
                statusMenuTabId={statusMenu?.tabId ?? null}
                onOpenStatusMenu={toggleStatusMenu}
                displaySettings={displaySettings}
                onOrganize={(mode: ForgeOrganizeMode) => {
                  sound.play("tick");
                  const tabIds = results.listedForgeIssueEntries.flatMap((entry) => {
                    const id = tabBrowserId(entry.tab);
                    return id === undefined ? [] : [id];
                  });
                  void sendExtensionMessage({ type: "organizeForgeIssueTabs", mode, tabIds }).catch(
                    (error) => debugError("Could not organize issue tabs:", error),
                  );
                }}
                onConfirmOrganizeChange={(confirm) => {
                  const next = { ...displaySettings, confirmOrganizeForgeTabs: confirm };
                  setDisplaySettings(next);
                  void saveDisplaySettings(next).catch((error) =>
                    debugError("Could not save organize confirmation:", error),
                  );
                }}
              />
            )}
            {layout === "overlay" && showRightColumn && (
              <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-[var(--zen-space-6)]">
                {showTodoColumn && (
                  <TodoNavigator
                    tabs={todoTabs}
                    allTabs={results.allTodoTabs}
                    statuses={statuses}
                    statusMenuTabId={statusMenu?.tabId ?? null}
                    truncate={displaySettings.truncateIssueTitles}
                    selectedIndex={
                      navigation.activePane === "todos" ? navigation.selectedTodoIndex : -1
                    }
                    onActivate={activateTodoTab}
                    onSelect={navigation.setSelectedTodoIndex}
                    onDone={(tab) => {
                      const tabId = tabBrowserId(tab);
                      if (tabId !== undefined) {
                        sound.play("success");
                        todoActions.setTodo(tabId, "none");
                      }
                    }}
                    onClear={(tabIds) => {
                      sound.play("success");
                      todoActions.clearTodos(tabIds);
                    }}
                    onOpenStatusMenu={toggleStatusMenu}
                    onContextMenu={openContextMenu}
                  />
                )}
                {showTimersDock && (
                  <TimersDock
                    timers={timers}
                    onClearAll={timerActions.clearAllTimers}
                    onClearTimer={timerActions.clearTimer}
                    onActivateTimer={(tabId) => {
                      const tab = tabs.find((item) => tabBrowserId(item) === tabId);
                      activateTab(tabId, tab?.domId, "timer tab");
                    }}
                    onEditTimer={openTimer}
                  />
                )}
              </div>
            )}
          </div>

          <StatusBar always={displaySettings.statusBar} />

          {statusMenu && (
            <TrafficLightMenu
              x={statusMenu.x}
              y={statusMenu.y}
              light={statuses.get(statusMenu.tabId)}
              onSelect={(light) => {
                setStatusMenu(null);
                statusActions.setStatus(statusMenu.tabId, light);
              }}
            />
          )}

          {contextMenu && (
            <TabContextMenu
              tab={contextMenu.tab}
              x={contextMenu.x}
              y={contextMenu.y}
              isTodo={todos.has(tabBrowserId(contextMenu.tab) ?? -1)}
              light={statuses.get(tabBrowserId(contextMenu.tab) ?? -1)}
              onRename={() => {
                rename.open(contextMenu.tab, stripTimerPrefixFromTab(contextMenu.tab));
                setContextMenu(null);
              }}
              onCopyLink={() => {
                const url = contextMenu.tab.url;
                setContextMenu(null);
                if (url) {
                  void copyText(url);
                }
              }}
              onOpenTimer={(tabId) => {
                setContextMenu(null);
                openTimer(tabId);
              }}
              onOpenHostOverrides={(tabId) => {
                setContextMenu(null);
                openHostOverrides(tabId);
              }}
              onSetTodo={(status) => {
                const tabId = tabBrowserId(contextMenu.tab);
                setContextMenu(null);
                if (tabId !== undefined) {
                  sound.play(status === "none" ? "success" : "mark");
                  todoActions.setTodo(tabId, status);
                }
              }}
              onSetLight={(light) => {
                const tabId = tabBrowserId(contextMenu.tab);
                setContextMenu(null);
                if (tabId !== undefined) {
                  statusActions.setStatus(tabId, light);
                }
              }}
              onCloseTab={(tabId) => {
                setContextMenu(null);
                void sendExtensionMessage({ type: "closeTab", tabId }).catch((error) =>
                  debugError("Could not close tab:", error),
                );
              }}
              onEditPinnedUrl={(tabId) => {
                const tab = contextMenu.tab;
                setContextMenu(null);
                setPinnedUrlDialog({ tab, tabId, value: tab.url, error: null });
                void sendExtensionMessage({ type: "getPinnedUrl", tabId })
                  .then((url) => {
                    setPinnedUrlDialog((current) =>
                      current?.tabId === tabId
                        ? { ...current, value: url || current.value }
                        : current,
                    );
                  })
                  .catch((error) => debugError("Could not read pinned URL:", error));
              }}
              onReplacePinnedUrl={(tabId) => {
                setContextMenu(null);
                void sendExtensionMessage({ type: "replacePinnedUrlWithCurrent", tabId }).catch(
                  (error) => debugError("Could not replace pinned URL:", error),
                );
              }}
              onMoveToFolder={(tabId, folderId) => {
                setContextMenu(null);
                void sendExtensionMessage({ type: "moveTabToFolder", tabId, folderId }).catch(
                  (error) => debugError("Could not move tab to folder:", error),
                );
              }}
              onRemoveFromFolder={(tabId) => {
                setContextMenu(null);
                void sendExtensionMessage({ type: "removeTabFromFolder", tabId }).catch((error) =>
                  debugError("Could not remove tab from folder:", error),
                );
              }}
            />
          )}

          {pinnedUrlDialog && (
            <EditPinnedUrlDialog
              value={pinnedUrlDialog.value}
              error={pinnedUrlDialog.error}
              onChange={(value) => setPinnedUrlDialog({ ...pinnedUrlDialog, value, error: null })}
              onCancel={() => setPinnedUrlDialog(null)}
              onSubmit={(value) => {
                const url = parsePinnedUrl(value);
                if (!url) {
                  setPinnedUrlDialog({ ...pinnedUrlDialog, error: "Enter a valid http(s) URL." });
                  return;
                }
                const tabId = pinnedUrlDialog.tabId;
                setPinnedUrlDialog(null);
                void sendExtensionMessage({ type: "setPinnedUrl", tabId, url }).catch((error) =>
                  debugError("Could not set pinned URL:", error),
                );
              }}
            />
          )}

          {rename.dialog && (
            <RenameTabDialog
              tab={rename.dialog.tab}
              value={rename.dialog.value}
              error={rename.error}
              onChange={rename.setValue}
              onSubmit={rename.submit}
              onCancel={rename.close}
            />
          )}
        </>
      )}
    </SearchShell>
  );
}
