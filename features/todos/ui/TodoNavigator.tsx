import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Reorder, useDragControls } from "motion/react";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { hostname } from "@/features/search/ui/lib/format";
import { NowTag } from "@/features/search/ui/components/NowTag";
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
import { TooltipLegend, useTooltip } from "@/shared/ui/primitives/Tooltip";

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

function todoRowClass(light: TrafficLight | undefined, selected: boolean): string {
  return cn(
    "zs-row relative flex w-full max-w-full min-w-0 shrink-0 flex-col gap-[calc(var(--zen-font-size)*0.43)] rounded-[var(--zen-radius-lg)]",
    "px-[var(--zen-space-3)] py-[calc(var(--zen-space-3)+var(--zen-todo-pad))]",
    statusRowClass(light, selected),
  );
}

function TodoRowBody({
  tab,
  truncate,
  onActivate,
  onSelect,
  onDone,
  onOpenStatusMenu,
  statusMenuTabId,
  statuses,
  dragHandle,
}: {
  tab: TabInfo;
  truncate: boolean;
  onActivate: (tab: TabInfo) => void;
  onSelect: () => void;
  onDone: (tab: TabInfo) => void;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
  statusMenuTabId: number | null;
  statuses: Map<number, TrafficLight>;
  dragHandle?: ComponentChildren;
}) {
  const tabId = tabBrowserId(tab);
  const light = tabId === undefined ? undefined : statuses.get(tabId);
  return (
    <>
      <div class="relative z-10 flex min-w-0 items-center gap-[var(--zen-space-2)]">
        {dragHandle}
        <button
          type="button"
          class="zs-row-title flex min-w-0 flex-1 cursor-pointer items-center gap-[var(--zen-space-2)] border-0 bg-transparent p-0 text-left text-inherit after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
          onClick={() => onActivate(tab)}
          onFocus={onSelect}
        >
          <span class={cn("min-w-0 flex-1", entryTextClass(truncate))}>
            {formatTabDisplayTitle(tab)}
          </span>
          {tab.active === true && <NowTag />}
        </button>
      </div>
      <div class="text-zen-muted relative z-10 flex min-w-0 items-center justify-between gap-[var(--zen-space-2)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.04em]">
        <span class={cn("min-w-0", entryTextClass(truncate))}>
          {tab.workspaceName || hostname(tab.url)}
        </span>
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <TooltipButton
            label="Mark as done"
            tooltip="Mark as done"
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
    </>
  );
}

function ReorderTodoRow({
  tab,
  index,
  selected,
  truncate,
  onActivate,
  onSelect,
  onDone,
  onOpenStatusMenu,
  onContextMenu,
  statusMenuTabId,
  statuses,
}: {
  tab: TabInfo;
  index: number;
  selected: boolean;
  truncate: boolean;
  onActivate: (tab: TabInfo) => void;
  onSelect: (index: number) => void;
  onDone: (tab: TabInfo) => void;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
  onContextMenu: (tab: TabInfo, event: MouseEvent) => void;
  statusMenuTabId: number | null;
  statuses: Map<number, TrafficLight>;
}) {
  const controls = useDragControls();
  const tabId = tabBrowserId(tab);
  const light = tabId === undefined ? undefined : statuses.get(tabId);
  return (
    <Reorder.Item
      as="div"
      value={tabId}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ opacity: 0.7 }}
      className={todoRowClass(light, selected)}
      data-testid="zen-todo-row"
      data-status-light={light}
      data-todo-selected={selected ? "true" : undefined}
      data-current={tab.active === true ? "true" : undefined}
      onContextMenu={(event: MouseEvent) => onContextMenu(tab, event)}
      ref={(element: HTMLElement | null) => {
        if (selected && typeof element?.scrollIntoView === "function") {
          element.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }}
    >
      <TodoRowBody
        tab={tab}
        truncate={truncate}
        onActivate={onActivate}
        onSelect={() => onSelect(index)}
        onDone={onDone}
        onOpenStatusMenu={onOpenStatusMenu}
        statusMenuTabId={statusMenuTabId}
        statuses={statuses}
        dragHandle={
          <div
            role="button"
            aria-label="Reorder todo"
            data-testid="zen-todo-drag"
            tabIndex={-1}
            class="text-zen-subtle hover:text-zen-text relative z-20 shrink-0 cursor-grab border-0 bg-transparent p-[var(--zen-space-1)] active:cursor-grabbing"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              controls.start(event);
            }}
          >
            <svg
              class="h-[var(--zen-icon-sm)] w-[var(--zen-icon-sm)]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="9" cy="7" r="1.4" fill="currentColor" />
              <circle cx="15" cy="7" r="1.4" fill="currentColor" />
              <circle cx="9" cy="12" r="1.4" fill="currentColor" />
              <circle cx="15" cy="12" r="1.4" fill="currentColor" />
              <circle cx="9" cy="17" r="1.4" fill="currentColor" />
              <circle cx="15" cy="17" r="1.4" fill="currentColor" />
            </svg>
          </div>
        }
      />
    </Reorder.Item>
  );
}

export function TodoNavigator({
  tabs,
  allTabs = tabs,
  statuses,
  statusMenuTabId,
  truncate,
  selectedIndex,
  onActivate,
  onSelect,
  onDone,
  onClear,
  onOpenStatusMenu,
  onContextMenu,
  onReorder,
}: {
  /** The rows to list: every todo, or the ones an "@" query matches. */
  tabs: TabInfo[];
  /** Every todo, whatever the query; the count and the "Clear" menu act on these. */
  allTabs?: TabInfo[];
  statuses: Map<number, TrafficLight>;
  /** The tab whose status menu is open, if any. */
  statusMenuTabId: number | null;
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
  /** Motion Reorder callback with the new tab-id order. Left out while filtering. */
  onReorder?: (tabIds: number[]) => void;
}) {
  // The omnibar is a <browser> in Zen's chrome, not a tab, so `window.confirm`
  // has nowhere to show and returns false: the confirmation lives in the column.
  const [pendingClear, setPendingClear] = useState<TodoClearFilter | null>(null);
  const clearTooltip = useTooltip();
  const pendingTabIds =
    pendingClear === null ? [] : todoTabIdsToClear(allTabs, statuses, pendingClear);
  const reorderIds = tabs.flatMap((tab) => {
    const id = tabBrowserId(tab);
    return id === undefined ? [] : [id];
  });
  const canReorder = onReorder !== undefined && reorderIds.length === tabs.length;

  const listClass =
    "zen-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-[var(--zen-todo-gap)] overflow-x-hidden overflow-y-auto";

  const rows = tabs.map((tab, index) => {
    const selected = selectedIndex === index;
    const tabId = tabBrowserId(tab);
    const light = tabId === undefined ? undefined : statuses.get(tabId);
    if (canReorder && tabId !== undefined) {
      return (
        <ReorderTodoRow
          key={tabId}
          tab={tab}
          index={index}
          selected={selected}
          truncate={truncate}
          onActivate={onActivate}
          onSelect={onSelect}
          onDone={onDone}
          onOpenStatusMenu={onOpenStatusMenu}
          onContextMenu={onContextMenu}
          statusMenuTabId={statusMenuTabId}
          statuses={statuses}
        />
      );
    }
    return (
      <div
        key={tab.id ?? tab.domId ?? tab.url}
        class={todoRowClass(light, selected)}
        data-testid="zen-todo-row"
        data-status-light={light}
        data-todo-selected={selected ? "true" : undefined}
        data-current={tab.active === true ? "true" : undefined}
        ref={(element) => {
          if (selected && typeof element?.scrollIntoView === "function") {
            element.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }}
        onContextMenu={(event) => onContextMenu(tab, event)}
      >
        <TodoRowBody
          tab={tab}
          truncate={truncate}
          onActivate={onActivate}
          onSelect={() => onSelect(index)}
          onDone={onDone}
          onOpenStatusMenu={onOpenStatusMenu}
          statusMenuTabId={statusMenuTabId}
          statuses={statuses}
        />
      </div>
    );
  });

  return (
    <aside
      class="zs-card flex min-h-0 min-w-0 flex-1 flex-col p-[var(--zen-space-5)]"
      data-testid="zen-todo-column"
    >
      <div class="zs-head">
        <PrefixHint prefixes={TODO_NAVIGATOR_PREFIXES} column="todos" />
        <strong class="min-w-0 truncate font-[inherit] font-medium">Todos</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <span class="text-zen-danger">{allTabs.length} to do</span>
          <>
            <span class="relative inline-flex items-center">
              <select
                class="zs-key text-zen-subtle hover:text-zen-text h-[var(--zen-mini-key)] appearance-none py-0 pr-[calc(var(--zen-icon-sm)+var(--zen-space-4))] pl-[var(--zen-space-3)] font-[inherit] text-[length:var(--zen-text-sm)] leading-none tracking-[0.04em] normal-case"
                aria-label="Clear todos"
                data-testid="zen-todo-clear"
                value=""
                onMouseEnter={(event) => clearTooltip.showAfterPause(event.currentTarget)}
                onMouseLeave={clearTooltip.hide}
                onFocus={(event) => clearTooltip.show(event.currentTarget)}
                onBlur={clearTooltip.hide}
                onClick={clearTooltip.hide}
                onChange={(event) => {
                  const select = event.currentTarget;
                  const filter = select.value as TodoClearFilter;
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
              <svg
                class="text-zen-subtle pointer-events-none absolute right-[var(--zen-space-2)] h-[var(--zen-icon-sm)] w-[var(--zen-icon-sm)]"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 9l6 6 6-6"
                />
              </svg>
            </span>
            {clearTooltip.anchor && (
              <TooltipLegend content="Mark several todos as done" anchor={clearTooltip.anchor} />
            )}
          </>
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
              data-own-sound=""
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
      {canReorder ? (
        <Reorder.Group
          as="div"
          axis="y"
          values={reorderIds}
          onReorder={onReorder}
          className={listClass}
          data-testid="zen-todo-list"
        >
          {rows}
        </Reorder.Group>
      ) : (
        <div class={listClass} data-testid="zen-todo-list">
          {tabs.length === 0 && (
            <p class="text-zen-muted m-0 py-[var(--zen-space-3)] text-center text-[length:var(--zen-text-sm)]">
              No matching todos.
            </p>
          )}
          {rows}
        </div>
      )}
    </aside>
  );
}
