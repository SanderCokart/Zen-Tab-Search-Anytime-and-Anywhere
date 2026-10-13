import { useMemo, useState } from "preact/hooks";
import { ForgeIssueNavigator } from "@/features/forge/ui/ForgeIssueNavigator";
import type { ForgeIssueSortMode } from "@/features/search/model/ranking";
import { groupTodoTabs } from "@/features/todos/model/todo";
import { TodoNavigator } from "@/features/todos/ui/TodoNavigator";
import { ActiveTimersPanel } from "@/features/search/ui/components/ActiveTimersPanel";
import { RenameTabDialog } from "@/features/search/ui/components/RenameTabDialog";
import { SearchResultsList } from "@/features/search/ui/components/SearchResultsList";
import { SearchShell } from "@/features/search/ui/components/SearchShell";
import { TabContextMenu } from "@/features/search/ui/components/TabContextMenu";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { useCloseOnOutsideClick } from "@/features/search/ui/hooks/useCloseOnOutsideClick";
import { useDisplaySettings } from "@/features/search/ui/hooks/useDisplaySettings";
import { useEssentialTabNames } from "@/features/search/ui/hooks/useEssentialTabNames";
import { useSearchNavigation } from "@/features/search/ui/hooks/useSearchNavigation";
import { useSearchResults } from "@/features/search/ui/hooks/useSearchResults";
import { useSearchSnapshot } from "@/features/search/ui/hooks/useSearchSnapshot";
import { useTabRename } from "@/features/search/ui/hooks/useTabRename";
import { useTimerActions } from "@/features/search/ui/hooks/useTimerActions";
import { useTodoActions } from "@/features/search/ui/hooks/useTodoActions";
import { stripTimerPrefixFromTab } from "@/features/search/ui/lib/format";
import { primaryButtonClass } from "@/features/search/ui/lib/styles";
import type { SearchLayout } from "@/features/search/ui/types";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import {
  isActivatableTab,
  tabBrowserId,
  type SearchItem,
  type TabInfo,
  type TodoStatus,
} from "@/shared/types";
import { type ForgeIssueEntry } from "@/features/forge/model/forge-label";
import { cn } from "@/shared/ui/cn";

export type { SearchLayout };

export interface SearchAppProps {
  onClose: () => void;
  pageJump?: number;
  layout?: SearchLayout;
}

/**
 * The search surface, rendered both as the toolbar popup and as the in-page
 * overlay. State lives in the hooks under `hooks/`; this component wires them
 * to the presentational pieces under `components/`.
 */
export function SearchApp({ onClose, pageJump = 5, layout = "popup" }: SearchAppProps) {
  const compact = layout === "popup";

  const [query, setQuery] = useState("");
  const [forgeSortMode, setForgeSortMode] = useState<ForgeIssueSortMode>("recent");
  const [timerTabId, setTimerTabId] = useState<number | null>(null);
  const [showTimers, setShowTimers] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    item: Extract<SearchItem, { kind: "tab" }>;
    x: number;
    y: number;
    /** "todo" when opened from the todo button, which shows only the todo options. */
    scope: "all" | "todo";
  } | null>(null);

  const { tabs, spaces, timers, todos, loadError, setTabs, setTimers, setTodos } =
    useSearchSnapshot();
  const displaySettings = useDisplaySettings();
  const { essentialNames, setEssentialNames } = useEssentialTabNames();

  const results = useSearchResults({
    tabs,
    spaces,
    essentialNames,
    displaySettings,
    layout,
    query,
    forgeSortMode,
  });

  const timerActions = useTimerActions({
    setTimers,
    onTimerFormClose: () => setTimerTabId(null),
  });

  const rename = useTabRename({ essentialNames, setEssentialNames, setTabs });
  const todoActions = useTodoActions({ setTodos });
  const todoColumn = useMemo(
    () => groupTodoTabs(results.labeledTabs, todos),
    [results.labeledTabs, todos],
  );
  const todoTabs = useMemo(
    () => [...todoColumn.todo, ...todoColumn.done].map((entry) => entry.tab),
    [todoColumn],
  );

  useCloseOnOutsideClick(contextMenu !== null, "[data-testid='zen-tab-context-menu']", () =>
    setContextMenu(null),
  );

  const activateTab = (tabId: number | undefined, domId: string | undefined, label: string) => {
    void sendExtensionMessage({ type: "switchTab", tabId, domId: domId || undefined })
      .then(onClose)
      .catch((error) => debugError(`Could not switch ${label}:`, error));
  };

  const activateItem = (item: SearchItem) => {
    if (item.kind === "space") {
      void sendExtensionMessage({ type: "switchSpace", spaceId: item.data.id })
        .then(onClose)
        .catch((error) => debugError("Could not switch space:", error));
      return;
    }
    if (!isActivatableTab(item.data)) return;
    activateTab(tabBrowserId(item.data), item.data.domId, "tab");
  };

  const activateForgeEntry = (entry: ForgeIssueEntry) => {
    if (!isActivatableTab(entry.tab)) return;
    activateTab(tabBrowserId(entry.tab), entry.tab.domId, "issue tab");
  };

  const activateTodoTab = (tab: TabInfo) => {
    if (!isActivatableTab(tab)) return;
    activateTab(tabBrowserId(tab), tab.domId, "todo tab");
  };

  // The overlay is three columns (tabs, issues, todos) when issue detection is
  // on, and two (tabs, todos) when it is off. The popup has no columns.
  const overlayAspect = displaySettings.detectForgeIssues ? "2/1" : "3/2";

  const navigation = useSearchNavigation({
    layout,
    query,
    pageJump,
    items: results.items,
    navigatorEntries: results.navigatorEntries,
    todoTabs,
    forgeNavigatorQuery: results.forgeNavigatorQuery,
    bestForgeIndex: results.bestForgeIndex,
    onClose,
    onActivateItem: activateItem,
    onActivateForgeEntry: activateForgeEntry,
    onActivateTodoTab: activateTodoTab,
  });

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
    >
      <div class="mb-[var(--zen-space-3)] flex items-center gap-[var(--zen-space-2)]">
        <input
          ref={navigation.inputRef}
          data-testid="zen-search-input"
          type="text"
          placeholder="Search tabs and spaces..."
          class={cn(
            "bg-zen-surface placeholder:text-zen-muted min-w-0 flex-1 border-0 outline-none",
            "rounded-[var(--zen-radius)] p-[var(--zen-space-2)] text-[length:var(--zen-text-lg)]",
            compact && "w-full",
          )}
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={navigation.onKeyDown}
        />
        <button
          type="button"
          class={cn(iconButtonClass, "relative")}
          title={showTimers ? "Close active timers" : "Show active timers"}
          onClick={() => setShowTimers(!showTimers)}
        >
          <TimerIcon close={showTimers} class="size-[var(--zen-icon-md)]" />
          {!showTimers && timers.size > 0 && (
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

      {showTimers && (
        <ActiveTimersPanel
          timers={timers}
          onClearAll={timerActions.clearAllTimers}
          onClearTimer={timerActions.clearTimer}
          onActivateTimer={(tabId) => {
            void sendExtensionMessage({ type: "switchTab", tabId }).then(onClose);
          }}
        />
      )}

      <div class={cn(layout === "overlay" && "flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden")}>
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
              timerTabId={timerTabId}
              registerOption={navigation.registerOption}
              onActivate={activateItem}
              onContextMenu={(item, x, y) => {
                if (item.kind === "tab") {
                  setContextMenu({ item, x, y, scope: "all" });
                }
              }}
              onTodoMenu={(item, x, y) => {
                if (item.kind === "tab") {
                  setContextMenu({ item, x, y, scope: "todo" });
                }
              }}
              onToggleTimerForm={(tabId) => setTimerTabId(timerTabId === tabId ? null : tabId)}
              onOpenTimerPopup={timerActions.openTimerPopup}
              onSetTimer={timerActions.setTimer}
              onClearTimer={timerActions.clearTimer}
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
            entries={results.filteredForgeIssueEntries}
            backgroundColor={displaySettings.issueBackgroundColor}
            truncate={displaySettings.truncateIssueTitles}
            sortMode={forgeSortMode}
            selectedIndex={
              navigation.activePane === "forge" ? navigation.selectedForgeIndex : -1
            }
            onActivate={activateForgeEntry}
            onSelect={navigation.setSelectedForgeIndex}
            onToggleSort={() => {
              setForgeSortMode((current) => (current === "recent" ? "old" : "recent"));
              navigation.setSelectedForgeIndex(0);
            }}
          />
        )}
        {layout === "overlay" && (
          <TodoNavigator
            todo={todoColumn.todo}
            done={todoColumn.done}
            backgroundColor={displaySettings.issueBackgroundColor}
            truncate={displaySettings.truncateIssueTitles}
            selectedIndex={
              navigation.activePane === "todos" ? navigation.selectedTodoIndex : -1
            }
            onActivate={activateTodoTab}
            onSelect={navigation.setSelectedTodoIndex}
          />
        )}
      </div>

      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.item.data}
          x={contextMenu.x}
          y={contextMenu.y}
          scope={contextMenu.scope}
          todoStatus={todos.get(tabBrowserId(contextMenu.item.data) ?? -1)}
          onRename={() => {
            rename.open(contextMenu.item.data, stripTimerPrefixFromTab(contextMenu.item.data));
            setContextMenu(null);
          }}
          onOpenTimer={(tabId) => {
            setContextMenu(null);
            timerActions.openTimerPopup(tabId);
          }}
          onSetTodo={(status: TodoStatus | "none") => {
            const tabId = tabBrowserId(contextMenu.item.data);
            setContextMenu(null);
            if (tabId !== undefined) {
              todoActions.setTodo(tabId, status);
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
