import type { SearchItemGroup } from "@/features/search/model/ranking";
import { TabSearchRow } from "@/features/search/ui/components/TabSearchRow";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import { statusRowClass } from "@/features/status/ui/traffic-light";
import {
  formatSpaceDisplayTitle,
  isEssentialTab,
  tabBrowserId,
  type SearchItem,
  type TabInfo,
  type TabTimer,
  type TabTodo,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export interface SearchResultsListProps {
  groups: SearchItemGroup[];
  /** Position of each item in the flat result list, for selection and refs. */
  itemIndices: Map<SearchItem, number>;
  selectedIndex: number;
  /** True while another overlay column owns the keyboard, so no result row looks selected. */
  navigateForge: boolean;
  displaySettings: DisplaySettings;
  timers: Map<number, TabTimer>;
  todos: Map<number, TabTodo>;
  statuses: Map<number, TrafficLight>;
  timerTabId: number | null;
  /** The tab whose status menu is open, if any. */
  statusMenuTabId: number | null;
  registerOption: (index: number, element: HTMLLIElement | null) => void;
  onActivate: (item: SearchItem) => void;
  /** Right-click on a tab row; spaces have no menu. */
  onContextMenu: (tab: TabInfo, event: MouseEvent) => void;
  onToggleTodo: (tabId: number) => void;
  onToggleTimerForm: (tabId: number) => void;
  onOpenTimerPopup: (tabId: number) => void;
  onSetTimer: (tabId: number, endAt: number) => void;
  onClearTimer: (tabId: number) => void;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
}

const sectionHeaderClass =
  "text-zen-subtle border-zen-line-soft border-b px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-xs)] font-semibold uppercase";

/** Renders the (possibly folder-nested) tab and space results. */
export function SearchResultsList(props: SearchResultsListProps) {
  return <>{renderGroups(props, props.groups, 0)}</>;
}

function renderGroups(props: SearchResultsListProps, groups: SearchItemGroup[], level: number) {
  const { displaySettings } = props;

  return groups.map((group, groupIndex) => {
    if (group.folderId === undefined) {
      const spaces = group.items.filter((item) => item.kind === "space");
      const essentialTabs = group.items.filter(
        (item) => item.kind === "tab" && isEssentialTab(item.data),
      );
      const tabs = group.items.filter((item) => item.kind === "tab" && !isEssentialTab(item.data));

      return (
        <section key={`ungrouped-${level}-${groupIndex}`} class="contents">
          {spaces.length > 0 && (
            <li
              class="rounded-[var(--zen-radius)] p-[var(--zen-space-1)]"
              style={{ backgroundColor: displaySettings.spaceBackgroundColor }}
              data-testid="zen-space-section"
            >
              <div class={sectionHeaderClass}>Spaces</div>
              <ul
                class="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,var(--zen-tile-space)),1fr))] gap-[var(--zen-space-gap)] p-[var(--zen-space-2)]"
                data-testid="zen-space-grid"
              >
                {spaces.map((item) => renderItem(props, item))}
              </ul>
            </li>
          )}
          {essentialTabs.length > 0 && (
            <li
              class="rounded-[var(--zen-radius)] p-[var(--zen-space-1)]"
              style={{ backgroundColor: displaySettings.spaceBackgroundColor }}
              data-testid="zen-essential-section"
            >
              <div class={sectionHeaderClass}>Essential tabs</div>
              <ul
                class="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,var(--zen-tile-essential)),1fr))] gap-[var(--zen-essential-gap)] p-[var(--zen-space-2)]"
                data-testid="zen-essential-grid"
              >
                {essentialTabs.map((item) => renderItem(props, item))}
              </ul>
            </li>
          )}
          {tabs.length > 0 && (
            <li>
              <ul
                class="m-0 flex list-none flex-col gap-[var(--zen-tab-gap)] p-0"
                data-testid="zen-tab-list"
              >
                {tabs.map((item) => renderItem(props, item))}
              </ul>
            </li>
          )}
        </section>
      );
    }

    return (
      <li
        key={`${group.folderId}-${level}-${groupIndex}`}
        class={cn(
          // Margin-top only: adjacent folders then sit exactly one folder gap
          // apart rather than two, and the last one adds no trailing space.
          "mt-[var(--zen-folder-gap)] first:mt-0",
          level > 0 && "mx-[var(--zen-space-1)]",
          "rounded-[var(--zen-radius)] p-[var(--zen-space-1)]",
        )}
        style={{ backgroundColor: displaySettings.folderBackgroundColor }}
        data-testid="zen-folder-section"
      >
        <div
          class={cn(
            "border-b px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-xs)] font-semibold uppercase",
            level === 0
              ? "border-gray-400/30 text-gray-300"
              : level === 1
                ? "border-gray-500/20 text-gray-400"
                : "border-gray-600/20 text-gray-500",
            level > 0 && "pl-[var(--zen-space-4)]",
            level > 1 && "pl-[calc(var(--zen-space-4)*1.5)]",
          )}
          data-testid="zen-folder-group"
          role="presentation"
        >
          {group.folderName}
        </div>
        <ul class="m-0 flex list-none flex-col gap-[var(--zen-tab-gap)] p-0">
          {group.items.map((item) => renderItem(props, item))}
          {renderGroups(props, group.children, level + 1)}
        </ul>
      </li>
    );
  });
}

function itemKey(item: SearchItem): string {
  if (item.kind === "space") {
    return `space:${item.data.id}`;
  }
  return `tab:${item.data.id ?? "none"}:${item.data.domId ?? item.data.url}`;
}

function renderItem(props: SearchResultsListProps, item: SearchItem) {
  const {
    itemIndices,
    selectedIndex,
    navigateForge,
    timers,
    todos,
    timerTabId,
    registerOption,
    onActivate,
    onContextMenu,
    onToggleTodo,
    onToggleTimerForm,
    onOpenTimerPopup,
    onSetTimer,
    onClearTimer,
    statuses,
    statusMenuTabId,
    onOpenStatusMenu,
  } = props;

  const index = itemIndices.get(item) ?? -1;
  const selected = !navigateForge && selectedIndex === index;
  const tabId = item.kind === "tab" ? tabBrowserId(item.data) : undefined;
  const light = tabId === undefined ? undefined : statuses.get(tabId);

  return (
    <li
      key={itemKey(item)}
      ref={(element) => registerOption(index, element)}
      data-testid="zen-search-item"
      data-selected={selected ? "true" : undefined}
      data-status-light={light}
      class={cn(
        "zen-search-row flex min-w-0 cursor-pointer items-start transition-colors",
        item.kind === "space" && "items-center justify-center text-center",
        "gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] p-[var(--zen-space-2)] text-[length:var(--zen-text-md)]",
        statusRowClass(light, selected),
        item.kind === "space" && item.data.isActive && "bg-zen-accent",
      )}
      role="option"
      aria-selected={selected}
      onContextMenu={(event) => {
        if (item.kind === "tab") {
          onContextMenu(item.data, event);
        }
      }}
      onClick={() => onActivate(item)}
    >
      {item.kind === "space" ? (
        <>
          <span class="mt-px flex size-[var(--zen-icon-lg)] shrink-0 items-center justify-center text-[length:var(--zen-text-base)] leading-none">
            {item.data.icon?.trim() || "◆"}
          </span>
          <div class="flex w-auto min-w-0 flex-col items-center gap-px text-inherit">
            <span
              class={cn(
                "min-w-0 flex-none text-[length:var(--zen-text-base)] font-semibold",
                entryTextClass(props.displaySettings.truncateTabTitles),
              )}
            >
              {formatSpaceDisplayTitle(item.data)}
            </span>
          </div>
        </>
      ) : (
        <TabSearchRow
          tab={item.data}
          timer={timers.get(tabId ?? -1)}
          isTodo={tabId !== undefined && todos.has(tabId)}
          light={light}
          statusMenuOpen={tabId !== undefined && statusMenuTabId === tabId}
          onOpenStatusMenu={onOpenStatusMenu}
          timerOpen={timerTabId !== null && timerTabId === tabId}
          truncate={props.displaySettings.truncateTabTitles}
          displayTitle={
            isEssentialTab(item.data) ? item.data.customLabel?.trim() || item.data.title : undefined
          }
          onToggleTodo={onToggleTodo}
          onToggleTimer={onToggleTimerForm}
          onOpenTimerPopup={onOpenTimerPopup}
          onSetTimer={onSetTimer}
          onClearTimer={onClearTimer}
        />
      )}
    </li>
  );
}
