import type { SearchItemGroup } from "@/features/search/model/ranking";
import { isCurrentTab, tabFolderKey } from "@/features/search/model/tab-folder-collapse";
import { TabFolderHeader } from "@/features/search/ui/components/TabFolderHeader";
import { TabSearchRow } from "@/features/search/ui/components/TabSearchRow";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import {
  backgroundPaint,
  customColor,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";
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
  /** Folders whose rows are folded away, by `tabFolderKey`; empty while a query is active. */
  collapsedFolders: ReadonlySet<string>;
  onToggleFolder: (key: string) => void;
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

/** Numbered by CSS counter (the list resets it), so no header text changes. */
const sectionHeaderClass = "zs-section-label";

/** The padding and radius a section needs once the user gives it a colour of its own. */
function tintedSection(color: string | undefined): string | false {
  return color !== undefined && "rounded-[var(--zen-radius)] p-[var(--zen-space-2)]";
}

/** Renders the (possibly folder-nested) tab and space results. */
export function SearchResultsList(props: SearchResultsListProps) {
  return <>{renderGroups(props, props.groups, 0)}</>;
}

function renderGroups(
  props: SearchResultsListProps,
  groups: SearchItemGroup[],
  level: number,
  /** A closed panel is drawing this group, so it must not repeat the current-tab row. */
  suppressKeep = false,
) {
  const { displaySettings } = props;

  return groups.map((group, groupIndex) => {
    if (group.folderId === undefined) {
      const spaces = group.items.filter((item) => item.kind === "space");
      const essentialTabs = group.items.filter(
        (item) => item.kind === "tab" && isEssentialTab(item.data),
      );
      const tabs = group.items.filter((item) => item.kind === "tab" && !isEssentialTab(item.data));
      const spaceColor = backgroundPaint(customColor(displaySettings.spaceBackgroundColor));

      return (
        <section key={`ungrouped-${level}-${groupIndex}`} class="contents">
          {spaces.length > 0 && (
            <li
              class={cn("min-w-0", tintedSection(spaceColor))}
              style={{ backgroundColor: spaceColor }}
              data-testid="zen-space-section"
            >
              <div class={sectionHeaderClass}>Spaces</div>
              <ul
                class="m-0 grid list-none grid-cols-3 gap-[var(--zen-space-gap)] p-0"
                data-testid="zen-space-grid"
              >
                {spaces.map((item) => renderItem(props, item))}
              </ul>
            </li>
          )}
          {essentialTabs.length > 0 && (
            <li
              class={cn("min-w-0", tintedSection(spaceColor))}
              style={{ backgroundColor: spaceColor }}
              data-testid="zen-essential-section"
            >
              <div class={sectionHeaderClass}>Essential tabs</div>
              <ul
                class="m-0 grid list-none grid-cols-2 gap-[var(--zen-essential-gap)] p-0"
                data-testid="zen-essential-grid"
              >
                {essentialTabs.map((item) => renderItem(props, item))}
              </ul>
            </li>
          )}
          {tabs.length > 0 && (
            <li class="min-w-0">
              {/* Under folders, a bare list would read as part of the folder above it. */}
              {level === 0 && groups.some((other) => other.folderId !== undefined) && (
                <div class={sectionHeaderClass} data-testid="zen-ungrouped-heading">
                  Tabs
                </div>
              )}
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

    const count = countTabs(group);
    const folderKey = tabFolderKey(group.folderId);
    const open = !props.collapsedFolders.has(folderKey);
    const showCurrent =
      !open && !suppressKeep && folderContainsCurrent(group) ? currentBranch(group) : undefined;

    return (
      <li
        key={`${group.folderId}-${level}-${groupIndex}`}
        class={cn(
          "zs-acc min-w-0",
          // A sub-folder follows its siblings by the folder gap; top-level sections are
          // spaced by the list's own section gap.
          level > 0 && "zs-subfolder mt-[var(--zen-folder-gap)]",
        )}
        data-testid="zen-folder-section"
        data-open={open || undefined}
      >
        <TabFolderHeader
          open={open}
          sub={level > 0}
          dim={level > 1}
          count={count}
          onToggle={() => props.onToggleFolder(folderKey)}
        >
          {group.folderName}
        </TabFolderHeader>
        {showCurrent && (
          <ul class="zs-tree-kids m-0 flex list-none flex-col gap-[var(--zen-tab-gap)]">
            {showCurrent.items.map((item) => renderItem(props, item))}
            {renderGroups(props, showCurrent.children, level + 1)}
          </ul>
        )}
        {/* Stays mounted, like an issue folder, so the height can ease shut. */}
        <div class="zs-acc-panel" role="region" aria-hidden={!open}>
          <div class="zs-acc-clip" inert={!open}>
            <ul class="zs-tree-kids m-0 flex list-none flex-col gap-[var(--zen-tab-gap)]">
              {(showCurrent ? group.items.filter((item) => !isCurrentTab(item)) : group.items).map(
                (item) => renderItem(props, item, open),
              )}
              {renderGroups(props, group.children, level + 1, !open)}
            </ul>
          </div>
        </div>
      </li>
    );
  });
}

/** The current tab, and the sub-folders that lead to it. Everything else stays folded. */
function currentBranch(group: SearchItemGroup): {
  items: SearchItem[];
  children: SearchItemGroup[];
} {
  return {
    items: group.items.filter(isCurrentTab),
    children: group.children.filter(folderContainsCurrent),
  };
}

function folderContainsCurrent(group: SearchItemGroup): boolean {
  return group.items.some(isCurrentTab) || group.children.some(folderContainsCurrent);
}

/** Every tab in a folder, sub-folders included. */
function countTabs(group: SearchItemGroup): number {
  return group.items.length + group.children.reduce((sum, child) => sum + countTabs(child), 0);
}

function itemKey(item: SearchItem): string {
  if (item.kind === "space") {
    return `space:${item.data.id}`;
  }
  return `tab:${item.data.id ?? "none"}:${item.data.domId ?? item.data.url}`;
}

function renderItem(props: SearchResultsListProps, item: SearchItem, interactive = true) {
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
  const selected = interactive && index >= 0 && !navigateForge && selectedIndex === index;
  const tabId = item.kind === "tab" ? tabBrowserId(item.data) : undefined;
  const light = tabId === undefined ? undefined : statuses.get(tabId);

  return (
    <li
      key={itemKey(item)}
      ref={(element) => {
        if (interactive && index >= 0) registerOption(index, element);
      }}
      data-testid="zen-search-item"
      data-selected={selected ? "true" : undefined}
      data-status-light={light}
      class={cn(
        "zen-search-row zs-row flex min-w-0 cursor-pointer items-center transition-colors",
        "rounded-[var(--zen-radius)] px-[var(--zen-row-pad)]",
        item.kind === "space" &&
          "min-h-[calc(var(--zen-row-height)*1.1)] justify-center gap-[var(--zen-space-2)] text-center",
        item.kind === "tab" &&
          isEssentialTab(item.data) &&
          "shadow-[inset_0_0_0_1px_var(--zs-hair)]",
        item.kind === "space" && item.data.isActive
          ? "bg-[var(--zs-key)] shadow-[var(--zs-key-shadow)]"
          : statusRowClass(light, selected),
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
          <span class="flex size-[var(--zen-icon-lg)] shrink-0 items-center justify-center text-[length:var(--zen-text-base)] leading-none">
            {item.data.icon?.trim() || "◆"}
          </span>
          <span class={cn("zs-row-title", entryTextClass(props.displaySettings.truncateTabTitles))}>
            {formatSpaceDisplayTitle(item.data)}
          </span>
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
