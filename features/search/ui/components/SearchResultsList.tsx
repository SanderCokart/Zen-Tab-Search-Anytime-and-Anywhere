import type { SearchItemGroup } from "@/features/search/model/ranking";
import { TabSearchRow } from "@/features/search/ui/components/TabSearchRow";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import {
  formatSpaceDisplayTitle,
  isEssentialTab,
  tabBrowserId,
  type SearchItem,
  type TabTimer,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export interface SearchResultsListProps {
  groups: SearchItemGroup[];
  /** Position of each item in the flat result list, for selection and refs. */
  itemIndices: Map<SearchItem, number>;
  selectedIndex: number;
  /** True while the forge navigator owns the selection, so no row looks selected. */
  navigateForge: boolean;
  compact: boolean;
  displaySettings: DisplaySettings;
  timers: Map<number, TabTimer>;
  timerTabId: number | null;
  registerOption: (index: number, element: HTMLLIElement | null) => void;
  onActivate: (item: SearchItem) => void;
  onContextMenu: (item: SearchItem, x: number, y: number) => void;
  onToggleTimerForm: (tabId: number) => void;
  onOpenTimerPopup: (tabId: number) => void;
  onSetTimer: (tabId: number, endAt: number) => void;
  onClearTimer: (tabId: number) => void;
}

const sectionHeaderClass =
  "text-zen-subtle border-zen-line-soft border-b px-2 py-1 text-xs font-semibold uppercase";

/** Renders the (possibly folder-nested) tab and space results. */
export function SearchResultsList(props: SearchResultsListProps) {
  return <>{renderGroups(props, props.groups, 0)}</>;
}

function renderGroups(props: SearchResultsListProps, groups: SearchItemGroup[], level: number) {
  const { compact, displaySettings } = props;

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
              class="rounded-md p-1"
              style={{ backgroundColor: displaySettings.spaceBackgroundColor }}
              data-testid="zen-space-section"
            >
              <div class={sectionHeaderClass}>Spaces</div>
              <ul
                class={cn(
                  "m-0 grid list-none gap-2 p-2",
                  compact
                    ? "grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]"
                    : "grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]",
                )}
                data-testid="zen-space-grid"
              >
                {spaces.map((item) => renderItem(props, item))}
              </ul>
            </li>
          )}
          {essentialTabs.length > 0 && (
            <li
              class="rounded-md p-1"
              style={{ backgroundColor: displaySettings.spaceBackgroundColor }}
              data-testid="zen-essential-section"
            >
              <div class={sectionHeaderClass}>Essential tabs</div>
              <ul
                class={cn(
                  "m-0 grid list-none gap-2 p-2",
                  compact
                    ? "grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]"
                    : "grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]",
                )}
                data-testid="zen-essential-grid"
              >
                {essentialTabs.map((item) => renderItem(props, item))}
              </ul>
            </li>
          )}
          {tabs.map((item) => renderItem(props, item))}
        </section>
      );
    }

    return (
      <li
        key={`${group.folderId}-${level}-${groupIndex}`}
        class={cn(level > 0 ? "mx-1 my-2" : "mt-3 first:mt-0", "rounded-md p-1")}
        style={{ backgroundColor: displaySettings.folderBackgroundColor }}
        data-testid="zen-folder-section"
      >
        <div
          class={cn(
            "border-b px-2 py-1 text-[12px] font-semibold uppercase",
            level === 0
              ? "border-gray-400/30 text-gray-300"
              : level === 1
                ? "border-gray-500/20 text-gray-400"
                : "border-gray-600/20 text-gray-500",
            level > 0 && "pl-4",
            level > 1 && "pl-6",
          )}
          data-testid="zen-folder-group"
          role="presentation"
        >
          {group.folderName}
        </div>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          {group.items.map((item) => renderItem(props, item))}
          {renderGroups(props, group.children, level + 1)}
        </ul>
      </li>
    );
  });
}

function renderItem(props: SearchResultsListProps, item: SearchItem) {
  const {
    itemIndices,
    selectedIndex,
    navigateForge,
    compact,
    timers,
    timerTabId,
    registerOption,
    onActivate,
    onContextMenu,
    onToggleTimerForm,
    onOpenTimerPopup,
    onSetTimer,
    onClearTimer,
  } = props;

  const index = itemIndices.get(item) ?? -1;
  const selected = !navigateForge && selectedIndex === index;

  return (
    <li
      key={`${item.kind}-${index}`}
      ref={(element) => registerOption(index, element)}
      data-testid="zen-search-item"
      data-selected={selected ? "true" : undefined}
      class={cn(
        "flex min-w-0 cursor-pointer items-start transition-colors",
        item.kind === "space" && "items-center justify-center text-center",
        compact ? "gap-2 rounded-md px-2 py-1.5 text-[13px]" : "gap-[12px] rounded-lg p-[12px]",
        selected ? "bg-zen-line-soft" : "hover:bg-zen-line-soft",
        item.kind === "space" && item.data.isActive && "bg-zen-accent",
      )}
      role="option"
      aria-selected={selected}
      onContextMenu={(event) => {
        if (item.kind !== "tab") {
          return;
        }
        event.preventDefault();
        onContextMenu(
          item,
          Math.min(event.clientX, window.innerWidth - 180),
          Math.min(event.clientY, window.innerHeight - 52),
        );
      }}
      onClick={() => onActivate(item)}
    >
      {item.kind === "space" ? (
        <>
          <span
            class={cn(
              "mt-px flex shrink-0 items-center justify-center leading-none",
              compact ? "size-4 text-xs" : "size-[24px] text-[16px]",
            )}
          >
            {item.data.icon?.trim() || "◆"}
          </span>
          <div class="flex w-auto min-w-0 flex-col items-center gap-px text-inherit">
            <span class={cn("min-w-0 flex-none truncate font-semibold", !compact && "text-[16px]")}>
              {formatSpaceDisplayTitle(item.data)}
            </span>
          </div>
        </>
      ) : (
        <TabRow
          item={item}
          timers={timers}
          timerTabId={timerTabId}
          compact={compact}
          onToggleTimerForm={onToggleTimerForm}
          onOpenTimerPopup={onOpenTimerPopup}
          onSetTimer={onSetTimer}
          onClearTimer={onClearTimer}
        />
      )}
    </li>
  );
}

function TabRow({
  item,
  timers,
  timerTabId,
  compact,
  onToggleTimerForm,
  onOpenTimerPopup,
  onSetTimer,
  onClearTimer,
}: {
  item: Extract<SearchItem, { kind: "tab" }>;
  timers: Map<number, TabTimer>;
  timerTabId: number | null;
  compact: boolean;
  onToggleTimerForm: (tabId: number) => void;
  onOpenTimerPopup: (tabId: number) => void;
  onSetTimer: (tabId: number, endAt: number) => void;
  onClearTimer: (tabId: number) => void;
}) {
  const tabId = tabBrowserId(item.data);

  return (
    <TabSearchRow
      tab={item.data}
      timer={timers.get(tabId ?? -1)}
      timerOpen={timerTabId !== null && timerTabId === tabId}
      compact={compact}
      displayTitle={
        isEssentialTab(item.data) ? item.data.customLabel?.trim() || item.data.title : undefined
      }
      onToggleTimer={() => tabId !== undefined && onToggleTimerForm(tabId)}
      onOpenTimerPopup={() => tabId !== undefined && onOpenTimerPopup(tabId)}
      onSetTimer={(endAt) => tabId !== undefined && onSetTimer(tabId, endAt)}
      onClearTimer={() => tabId !== undefined && onClearTimer(tabId)}
    />
  );
}
