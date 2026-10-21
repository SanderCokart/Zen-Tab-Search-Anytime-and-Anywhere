import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { ForgeIssueNavigator } from "@/features/forge/ui/ForgeIssueNavigator";
import type { ForgeIssueSortMode } from "@/features/search/model/ranking";
import { TodoNavigator } from "@/features/todos/ui/TodoNavigator";
import {
  TRAFFIC_LIGHT_MENU_SELECTOR,
  TRAFFIC_LIGHT_TRIGGER_SELECTOR,
  TrafficLightMenu,
} from "@/features/status/ui/TrafficLightMenu";
import { ActiveTimersPanel } from "@/features/search/ui/components/ActiveTimersPanel";
import { OmnibarViewPanel } from "@/features/search/ui/components/OmnibarViewPanel";
import { RenameTabDialog } from "@/features/search/ui/components/RenameTabDialog";
import { SearchInput } from "@/features/search/ui/components/SearchInput";
import { SearchResultsList } from "@/features/search/ui/components/SearchResultsList";
import { SearchShell } from "@/features/search/ui/components/SearchShell";
import { TabContextMenu } from "@/features/search/ui/components/TabContextMenu";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { useCloseOnOutsideClick } from "@/features/search/ui/hooks/useCloseOnOutsideClick";
import { useDisplaySettings } from "@/features/search/ui/hooks/useDisplaySettings";
import { useOverlayEntrance } from "@/features/search/ui/hooks/useOverlayEntrance";
import { useEssentialTabNames } from "@/features/search/ui/hooks/useEssentialTabNames";
import { useSearchNavigation } from "@/features/search/ui/hooks/useSearchNavigation";
import { useSearchResults } from "@/features/search/ui/hooks/useSearchResults";
import { useSearchSnapshot } from "@/features/search/ui/hooks/useSearchSnapshot";
import { useTabRename } from "@/features/search/ui/hooks/useTabRename";
import { useTimerActions } from "@/features/search/ui/hooks/useTimerActions";
import { useStatusActions } from "@/features/search/ui/hooks/useStatusActions";
import { useTodoActions } from "@/features/search/ui/hooks/useTodoActions";
import { stripTimerPrefixFromTab } from "@/features/search/ui/lib/format";
import { primaryButtonClass } from "@/features/search/ui/lib/styles";
import type { SearchLayout } from "@/features/search/ui/types";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { OmnibarView } from "@/shared/messaging/protocol";
import { isActivatableTab, tabBrowserId, type SearchItem, type TabInfo } from "@/shared/types";
import { type ForgeIssueEntry } from "@/features/forge/model/forge-label";
import { cn } from "@/shared/ui/cn";

export type { SearchLayout };

type PanelView = Exclude<OmnibarView, { kind: "search" }>;

export interface SearchAppProps {
  onClose: () => void;
  pageJump?: number;
  layout?: SearchLayout;
  /** The overlay view to open on instead of the tab, issue and todo columns. */
  initialView?: OmnibarView;
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
  const [timerTabId, setTimerTabId] = useState<number | null>(null);
  const [showTimers, setShowTimers] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ tab: TabInfo; x: number; y: number } | null>(
    null,
  );

  const [statusMenu, setStatusMenu] = useState<{ tabId: number; x: number; y: number } | null>(
    null,
  );

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
  } = useSearchSnapshot();
  const { displaySettings, loaded: settingsLoaded } = useDisplaySettings();
  const { essentialNames, setEssentialNames } = useEssentialTabNames();

  const results = useSearchResults({
    tabs,
    spaces,
    essentialNames,
    todos,
    displaySettings,
    layout,
    query,
    forgeSortMode,
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

  const openContextMenu = useCallback((tab: TabInfo, event: MouseEvent) => {
    event.preventDefault();
    setStatusMenu(null);
    setContextMenu({ tab, x: event.clientX, y: event.clientY });
  }, []);

  const toggleStatusMenu = useCallback((tab: TabInfo, anchor: DOMRect) => {
    const tabId = tabBrowserId(tab);
    setContextMenu(null);
    setStatusMenu((current) =>
      tabId === undefined || current?.tabId === tabId
        ? null
        : { tabId, x: anchor.left, y: anchor.bottom + 4 },
    );
  }, []);

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
    (tabId: number) => todoActions.setTodo(tabId, todos.has(tabId) ? "none" : "todo"),
    [todoActions, todos],
  );

  const onToggleTimerForm = useCallback(
    (tabId: number) => setTimerTabId((current) => (current === tabId ? null : tabId)),
    [],
  );

  // Size the overlay to the columns that are actually on screen. Using the
  // detection flag here reserved a second column before any issues existed,
  // so the panel jumped the moment the snapshot arrived.
  const overlayColumns =
    1 + (results.forgeIssueEntries.length > 0 ? 1 : 0) + (results.allTodoTabs.length > 0 ? 1 : 0);
  const overlayAspect = overlayColumns === 3 ? "2/1" : overlayColumns === 2 ? "3/2" : "1/1";
  const overlayOpen = useOverlayEntrance(layout === "overlay", snapshotLoaded && settingsLoaded);

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
  });

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
    "size-[var(--zen-control)] rounded-[var(--zen-radius)]",
  );

  return (
    <SearchShell
      layout={layout}
      onClose={onClose}
      displaySettings={displaySettings}
      aspect={layout === "overlay" ? overlayAspect : "1/1"}
      open={layout === "overlay" ? overlayOpen : true}
    >
      <div class="mb-[var(--zen-space-3)] flex items-center gap-[var(--zen-space-2)]">
        <SearchInput
          inputRef={navigation.inputRef}
          compact={compact}
          initialValue={initialQuery}
          inert={view?.kind === "timer" || view?.kind === "hosts"}
          onQueryChange={(next) => {
            setQuery(next);
            // Typing goes back to the search the input is for.
            if (view) setView(undefined);
          }}
          onKeyDown={navigation.onKeyDown}
        />
        <button
          type="button"
          class={cn(iconButtonClass, "relative")}
          title={timersOpen ? "Close active timers" : "Show active timers"}
          onClick={toggleTimers}
        >
          <TimerIcon close={timersOpen} class="size-[var(--zen-icon-md)]" />
          {!timersOpen && timers.size > 0 && (
            <span
              class={cn(
                "bg-zen-badge absolute -top-1 -right-1 rounded-full text-center",
                "min-w-[var(--zen-icon-md)] px-[var(--zen-space-1)]",
                "text-[length:var(--zen-text-xs)] leading-[var(--zen-icon-md)]",
              )}
            >
              {timers.size}
            </span>
          )}
        </button>
        <button
          type="button"
          class={iconButtonClass}
          title="Host overrides for this tab"
          aria-label="Host overrides for this tab"
          disabled={currentTabId === undefined}
          onClick={() => {
            if (currentTabId !== undefined) {
              openHostOverrides(currentTabId);
            }
          }}
        >
          <span aria-hidden="true" class="text-[length:var(--zen-text-base)]">
            ⇄
          </span>
        </button>
        <button
          type="button"
          class={iconButtonClass}
          title="Open display settings"
          aria-label="Open display settings"
          onClick={() =>
            void sendExtensionMessage({ type: "openSettings" }).catch((error) =>
              debugError("Could not open settings:", error),
            )
          }
        >
          <span aria-hidden="true" class="text-[length:var(--zen-text-base)]">
            ⚙
          </span>
        </button>
      </div>

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
        class={cn(layout === "overlay" && "flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden")}
        // Kept mounted under a view so the lists keep their scroll and selection.
        style={view ? { display: "none" } : undefined}
      >
        <div class={cn(layout === "overlay" && "flex min-h-0 min-w-0 flex-1 flex-col")}>
          <ul
            class={cn(
              "zen-scroll m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0",
              "gap-[var(--zen-section-gap)]",
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
          {(loadError ||
            (results.items.length === 0 && results.visibleTabs.length + spaces.length > 0)) && (
            <div class="text-zen-muted px-1 py-3 text-center text-xs">
              {loadError || "No tabs or spaces found."}
            </div>
          )}
          {!loadError && tabs.length + spaces.length === 0 && (
            <div class="text-zen-muted px-1 py-3 text-center text-xs">Loading tabs and spaces…</div>
          )}
        </div>

        {layout === "overlay" && results.forgeIssueEntries.length > 0 && (
          <ForgeIssueNavigator
            entries={results.listedForgeIssueEntries}
            currentEntry={results.currentForgeEntry}
            backgroundColor={displaySettings.issueBackgroundColor}
            truncate={displaySettings.truncateIssueTitles}
            sortMode={forgeSortMode}
            selectedIndex={navigation.activePane === "forge" ? navigation.selectedForgeIndex : -1}
            onActivate={activateForgeEntry}
            onSelect={navigation.setSelectedForgeIndex}
            onToggleSort={() => {
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
          />
        )}
        {layout === "overlay" && results.allTodoTabs.length > 0 && (
          <TodoNavigator
            tabs={todoTabs}
            allTabs={results.allTodoTabs}
            statuses={statuses}
            statusMenuTabId={statusMenu?.tabId ?? null}
            backgroundColor={displaySettings.issueBackgroundColor}
            truncate={displaySettings.truncateIssueTitles}
            selectedIndex={navigation.activePane === "todos" ? navigation.selectedTodoIndex : -1}
            onActivate={activateTodoTab}
            onSelect={navigation.setSelectedTodoIndex}
            onDone={(tab) => {
              const tabId = tabBrowserId(tab);
              if (tabId !== undefined) {
                todoActions.setTodo(tabId, "none");
              }
            }}
            onClear={todoActions.clearTodos}
            onOpenStatusMenu={toggleStatusMenu}
            onContextMenu={openContextMenu}
          />
        )}
      </div>

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
    </SearchShell>
  );
}
