import { useState } from "preact/hooks";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { hostname } from "@/features/search/ui/lib/format";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { PrefixHint } from "@/features/search/ui/components/PrefixHint";
import { TODO_NAVIGATOR_PREFIXES } from "@/features/search/model/ranking";
import { StatusButton } from "@/features/status/ui/StatusButton";
import { TRAFFIC_LIGHT_OPTIONS } from "@/features/status/model/status";
import { todoTabIdsToClear, type TodoClearFilter } from "@/features/todos/model/todo";
import { statusRowClass } from "@/features/status/ui/traffic-light";
import {
  formatTabDisplayTitle,
  tabBrowserId,
  type TabInfo,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";

/**
 * The third overlay column: tabs marked as todo. Clicking a row switches to its
 * tab, its "Mark as done" link removes the todo, the status button beside it
 * sets the tab's status color, and right-clicking opens the tab context menu.
 * The header's "Clear" menu marks every todo, or every todo of one status
 * color, done after a confirmation. Only rendered while there is at least one todo.
 */
/** The confirmation the "Clear" menu shows before marking `count` todos done. */
function clearMessage(filter: TodoClearFilter, count: number): string {
  const which = filter === "all" ? "" : ` with status ${filter}`;
  const todos = count === 1 ? "1 todo" : `${count} todos`;
  return `Mark ${todos}${which} as done?`;
}

/** "All" plus one entry per status color, with how many todos each would clear. */
function clearOptions(
  tabs: TabInfo[],
  statuses: Map<number, TrafficLight>,
): { filter: TodoClearFilter; label: string; count: number }[] {
  return [{ light: "all" as const, label: "All" }, ...TRAFFIC_LIGHT_OPTIONS].map(
    ({ light, label }) => ({
      filter: light,
      label,
      count: todoTabIdsToClear(tabs, statuses, light).length,
    }),
  );
}

export function TodoNavigator({
  tabs,
  allTabs = tabs,
  statuses,
  statusMenuTabId,
  backgroundColor,
  truncate,
  selectedIndex,
  onActivate,
  onSelect,
  onDone,
  onClear,
  onOpenStatusMenu,
  onContextMenu,
  class: className = "flex-1",
}: {
  /** The rows to list: every todo, or the ones an "@" query matches. */
  tabs: TabInfo[];
  /** Every todo, whatever the query; the count and the "Clear" menu act on these. */
  allTabs?: TabInfo[];
  statuses: Map<number, TrafficLight>;
  /** The tab whose status menu is open, if any. */
  statusMenuTabId: number | null;
  /** A custom colour; left out, the card takes its colour from the theme. */
  backgroundColor?: string;
  truncate: boolean;
  selectedIndex: number;
  onActivate: (tab: TabInfo) => void;
  onSelect: (index: number) => void;
  onDone: (tab: TabInfo) => void;
  /** Marks these todo tabs done. */
  onClear: (tabIds: number[]) => void;
  /** Opens the status menu under the button at `anchor`. */
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
  onContextMenu: (tab: TabInfo, event: MouseEvent) => void;
  /** How the column sizes itself in its parent; fills it by default. */
  class?: string;
}) {
  // The omnibar is a <browser> in Zen's chrome, not a tab, so `window.confirm`
  // has nowhere to show and returns false: the confirmation lives in the column.
  const [pendingClear, setPendingClear] = useState<TodoClearFilter | null>(null);
  const pendingTabIds =
    pendingClear === null ? [] : todoTabIdsToClear(allTabs, statuses, pendingClear);
  return (
    <aside
      class={cn(
        "zs-card flex min-h-0 min-w-0 flex-col overflow-hidden p-[var(--zen-space-5)]",
        className,
      )}
      style={{ backgroundColor }}
      data-testid="zen-todo-column"
    >
      <div class="zs-head">
        <PrefixHint prefixes={TODO_NAVIGATOR_PREFIXES} column="todos" />
        <strong class="min-w-0 truncate font-[inherit] font-medium">Todos</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <span class="text-zen-danger">{allTabs.length} to do</span>
          <select
            class="zs-key text-zen-subtle hover:text-zen-text px-[var(--zen-space-1)] font-[inherit] text-[length:var(--zen-text-xs)] tracking-[0.04em] normal-case"
            aria-label="Clear todos"
            title="Mark several todos as done"
            data-testid="zen-todo-clear"
            value=""
            onChange={(event) => {
              const select = event.currentTarget;
              const filter = select.value as TodoClearFilter;
              // Always back to the "Clear…" prompt, whatever the answer.
              select.value = "";
              if (todoTabIdsToClear(allTabs, statuses, filter).length > 0) {
                setPendingClear(filter);
              }
            }}
          >
            <option value="" disabled>
              Clear…
            </option>
            {clearOptions(allTabs, statuses).map(({ filter, label, count }) => (
              <option key={filter} value={filter} disabled={count === 0}>
                {label} ({count})
              </option>
            ))}
          </select>
        </span>
      </div>
      {pendingClear !== null && pendingTabIds.length > 0 && (
        <div
          class="zs-well mb-[var(--zen-space-2)] flex min-w-0 items-center justify-between gap-[var(--zen-space-2)] rounded-[var(--zs-r-lcd)] p-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]"
          role="alertdialog"
          aria-label="Confirm clearing todos"
          data-testid="zen-todo-clear-confirm"
        >
          <span class="min-w-0 truncate">{clearMessage(pendingClear, pendingTabIds.length)}</span>
          <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
            <button
              type="button"
              class="zs-key zs-key-red px-[var(--zen-space-2)] font-[inherit] text-[length:var(--zen-text-sm)]"
              data-testid="zen-todo-clear-confirm-button"
              onClick={() => {
                setPendingClear(null);
                onClear(pendingTabIds);
              }}
            >
              Mark done
            </button>
            <button
              type="button"
              class="text-zen-subtle hover:text-zen-text cursor-pointer border-0 bg-transparent px-[var(--zen-space-1)] font-[inherit] text-[length:var(--zen-text-sm)] hover:underline"
              data-testid="zen-todo-clear-cancel-button"
              onClick={() => setPendingClear(null)}
            >
              Cancel
            </button>
          </span>
        </div>
      )}
      <div class="zen-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-[var(--zen-todo-gap)] overflow-x-hidden overflow-y-auto">
        {tabs.length === 0 && (
          <p class="text-zen-muted m-0 py-[var(--zen-space-3)] text-center text-[length:var(--zen-text-sm)]">
            No matching todos.
          </p>
        )}
        {tabs.map((tab, index) => {
          const selected = selectedIndex === index;
          const tabId = tabBrowserId(tab);
          const light = tabId === undefined ? undefined : statuses.get(tabId);
          return (
            <div
              key={tab.id ?? tab.domId ?? tab.url}
              class={cn(
                "zs-row flex w-full max-w-full min-w-0 shrink-0 flex-col gap-[calc(var(--zen-font-size)*0.43)] rounded-[var(--zen-radius-lg)]",
                "px-[var(--zen-space-3)] py-[var(--zen-space-3)]",
                light
                  ? statusRowClass(light, selected)
                  : selected
                    ? "bg-[color-mix(in_srgb,var(--zs-red)_18%,var(--zs-card))]"
                    : "bg-[color-mix(in_srgb,var(--zs-red)_9%,var(--zs-card))]",
              )}
              data-status-light={light}
              data-todo-selected={selected ? "true" : undefined}
              ref={(element) => {
                if (selected) {
                  element?.scrollIntoView({ block: "nearest", inline: "nearest" });
                }
              }}
              onContextMenu={(event) => onContextMenu(tab, event)}
            >
              <button
                type="button"
                // Stretched over the whole block, so the space line below clicks through too.
                class="zs-row-title block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
                onClick={() => onActivate(tab)}
                onFocus={() => onSelect(index)}
                title={tab.url}
              >
                <span class={cn("block w-full min-w-0", entryTextClass(truncate))}>
                  {formatTabDisplayTitle(tab)}
                </span>
              </button>
              <div class="text-zen-muted relative z-10 flex min-w-0 items-center justify-between gap-[var(--zen-space-2)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.04em]">
                <span class={cn("min-w-0", entryTextClass(truncate))}>
                  {tab.workspaceName || hostname(tab.url)}
                </span>
                <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
                  <TooltipButton
                    label="Mark as done"
                    tooltip="Mark as done and remove from your todos"
                    data-testid="zen-todo-done-button"
                    class="text-zen-muted hover:text-zen-text shrink-0 cursor-pointer border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] whitespace-nowrap uppercase hover:underline"
                    onClick={() => onDone(tab)}
                  >
                    Mark as done
                  </TooltipButton>
                  <StatusButton
                    tab={tab}
                    light={light}
                    open={tabId !== undefined && statusMenuTabId === tabId}
                    onOpenMenu={onOpenStatusMenu}
                    class="text-zen-subtle hover:text-zen-text border-0 bg-transparent p-[calc(var(--zen-space-1)*0.5)]"
                    iconClass="size-[var(--zen-icon-sm)]"
                  />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
