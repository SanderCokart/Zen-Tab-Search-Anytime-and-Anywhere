import { entryTextClass } from "@/features/search/ui/lib/styles";
import { hostname } from "@/features/search/ui/lib/format";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
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
  confirm = (message) => window.confirm(message),
}: {
  tabs: TabInfo[];
  statuses: Map<number, TrafficLight>;
  /** The tab whose status menu is open, if any. */
  statusMenuTabId: number | null;
  backgroundColor: string;
  truncate: boolean;
  selectedIndex: number;
  onActivate: (tab: TabInfo) => void;
  onSelect: (index: number) => void;
  onDone: (tab: TabInfo) => void;
  /** Marks these todo tabs done. */
  onClear: (tabIds: number[]) => void;
  /** Asks before clearing; `window.confirm` unless a test supplies one. */
  confirm?: (message: string) => boolean;
  /** Opens the status menu under the button at `anchor`. */
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
  onContextMenu: (tab: TabInfo, event: MouseEvent) => void;
}) {
  return (
    <aside
      class="border-zen-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--zen-radius-lg)] border p-[var(--zen-space-2)]"
      style={{ backgroundColor }}
      data-testid="zen-todo-column"
    >
      <div class="mb-[var(--zen-space-2)] flex min-w-0 items-center justify-between gap-[var(--zen-space-2)]">
        <strong class="min-w-0 truncate text-[length:var(--zen-text-base)]">Todos</strong>
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <span class="text-zen-lavender text-[length:var(--zen-text-sm)]">
            {tabs.length} to do
          </span>
          <select
            class="border-zen-line bg-zen-chip text-zen-subtle hover:text-zen-text cursor-pointer rounded-[var(--zen-radius)] border px-[var(--zen-space-1)] font-[inherit] text-[length:var(--zen-text-sm)]"
            aria-label="Clear todos"
            title="Mark several todos as done"
            data-testid="zen-todo-clear"
            value=""
            onChange={(event) => {
              const select = event.currentTarget;
              const filter = select.value as TodoClearFilter;
              // Always back to the "Clear…" prompt, whatever the answer.
              select.value = "";
              const tabIds = todoTabIdsToClear(tabs, statuses, filter);
              if (tabIds.length === 0) {
                return;
              }
              const which = filter === "all" ? "" : ` with status ${filter}`;
              const count = tabIds.length === 1 ? "1 todo" : `${tabIds.length} todos`;
              if (confirm(`Mark ${count}${which} as done?`)) {
                onClear(tabIds);
              }
            }}
          >
            <option value="" disabled>
              Clear…
            </option>
            {clearOptions(tabs, statuses).map(({ filter, label, count }) => (
              <option key={filter} value={filter} disabled={count === 0}>
                {label} ({count})
              </option>
            ))}
          </select>
        </span>
      </div>
      <div class="zen-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {tabs.map((tab, index) => {
          const selected = selectedIndex === index;
          const tabId = tabBrowserId(tab);
          const light = tabId === undefined ? undefined : statuses.get(tabId);
          return (
            <div
              key={tab.id ?? tab.domId ?? tab.url}
              class={cn(
                "flex w-full max-w-full min-w-0 shrink-0 items-end overflow-hidden rounded-[var(--zen-radius)]",
                statusRowClass(light, selected),
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
                class="flex min-w-0 flex-1 cursor-pointer flex-col overflow-hidden border-0 bg-transparent p-[var(--zen-space-2)] text-left font-[inherit] text-inherit"
                onClick={() => onActivate(tab)}
                onFocus={() => onSelect(index)}
                title={tab.url}
              >
                <span
                  class={cn(
                    "block w-full min-w-0 text-[length:var(--zen-text-base)]",
                    entryTextClass(truncate),
                  )}
                >
                  {formatTabDisplayTitle(tab)}
                </span>
                <span
                  class={cn(
                    "text-zen-subtle block w-full min-w-0 text-[length:var(--zen-text-sm)]",
                    entryTextClass(truncate),
                  )}
                >
                  {tab.active
                    ? `${tab.workspaceName || hostname(tab.url)} · Current tab`
                    : tab.workspaceName || hostname(tab.url)}
                </span>
              </button>
              <span class="flex shrink-0 items-center">
                <TooltipButton
                  label="Mark as done"
                  tooltip="Mark as done and remove from your todos"
                  data-testid="zen-todo-done-button"
                  class="text-zen-subtle hover:text-zen-text shrink-0 cursor-pointer border-0 bg-transparent p-[var(--zen-space-2)] font-[inherit] text-[length:var(--zen-text-sm)] whitespace-nowrap hover:underline"
                  onClick={() => onDone(tab)}
                >
                  Mark as done
                </TooltipButton>
                <StatusButton
                  tab={tab}
                  light={light}
                  open={tabId !== undefined && statusMenuTabId === tabId}
                  onOpenMenu={onOpenStatusMenu}
                  class="text-zen-subtle hover:text-zen-text p-[var(--zen-space-2)]"
                  iconClass="size-[var(--zen-icon-md)]"
                />
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
