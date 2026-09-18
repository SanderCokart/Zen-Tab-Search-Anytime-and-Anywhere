import { useState } from "preact/hooks";
import { ForgeIssueNavigator } from "@/features/forge/ui/ForgeIssueNavigator";
import type { ForgeIssueSortMode } from "@/features/search/model/ranking";
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
import { stripTimerPrefixFromTab } from "@/features/search/ui/lib/format";
import { primaryButtonClass } from "@/features/search/ui/lib/styles";
import type { SearchLayout } from "@/features/search/ui/types";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import { isActivatableTab, tabBrowserId, type SearchItem } from "@/shared/types";
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
  } | null>(null);

  const { tabs, spaces, timers, loadError, setTabs, setTimers } = useSearchSnapshot();
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

  const navigation = useSearchNavigation({
    layout,
    query,
    pageJump,
    items: results.items,
    navigatorEntries: results.navigatorEntries,
    forgeNavigatorQuery: results.forgeNavigatorQuery,
    bestForgeIndex: results.bestForgeIndex,
    onClose,
    onActivateItem: activateItem,
    onActivateForgeEntry: activateForgeEntry,
  });

  const iconButtonClass = cn(
    primaryButtonClass,
    "inline-flex shrink-0 items-center justify-center p-0",
    compact ? "size-8" : "size-[44px]",
  );

  return (
    <SearchShell
      layout={layout}
      onClose={onClose}
      textColor={displaySettings.textColor}
      issueNavigator={displaySettings.detectForgeIssues}
    >
      <div class={cn("flex items-center", compact ? "mb-2 gap-2" : "mb-[16px] gap-2")}>
        <input
          ref={navigation.inputRef}
          data-testid="zen-search-input"
          type="text"
          placeholder="Search tabs and spaces..."
          class={cn(
            "bg-zen-surface placeholder:text-zen-muted min-w-0 flex-1 rounded-lg border-0 outline-none",
            compact ? "w-full px-2.5 py-2 text-sm" : "p-[12px] text-[18px]",
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
          <TimerIcon close={showTimers} class={compact ? "size-3.5" : "size-[16px]"} />
          {!showTimers && timers.size > 0 && (
            <span
              class={cn(
                "bg-zen-badge absolute -top-1 -right-1 rounded-full text-center",
                compact
                  ? "min-w-3.5 px-0.5 text-[9px] leading-[14px]"
                  : "min-w-4 px-1 text-[10px] leading-4",
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
          <span aria-hidden="true" class={compact ? "text-sm" : "text-lg"}>
            ⚙
          </span>
        </button>
      </div>

      {showTimers && (
        <ActiveTimersPanel
          timers={timers}
          compact={compact}
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
              "zen-scroll m-0 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto p-0",
              compact && "min-h-[60px]",
            )}
            role="listbox"
          >
            <SearchResultsList
              groups={results.itemGroups}
              itemIndices={results.itemIndices}
              selectedIndex={navigation.selectedIndex}
              navigateForge={navigation.navigateForge}
              compact={compact}
              displaySettings={displaySettings}
              timers={timers}
              timerTabId={timerTabId}
              registerOption={navigation.registerOption}
              onActivate={activateItem}
              onContextMenu={(item, x, y) => {
                if (item.kind === "tab") {
                  setContextMenu({ item, x, y });
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
            sortMode={forgeSortMode}
            selectedIndex={navigation.navigateForge ? navigation.selectedForgeIndex : -1}
            onActivate={activateForgeEntry}
            onSelect={navigation.setSelectedForgeIndex}
            onToggleSort={() => {
              setForgeSortMode((current) => (current === "recent" ? "old" : "recent"));
              navigation.setSelectedForgeIndex(0);
            }}
          />
        )}
      </div>

      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.item.data}
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={() => {
            rename.open(contextMenu.item.data, stripTimerPrefixFromTab(contextMenu.item.data));
            setContextMenu(null);
          }}
          onOpenTimer={(tabId) => {
            setContextMenu(null);
            timerActions.openTimerPopup(tabId);
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
