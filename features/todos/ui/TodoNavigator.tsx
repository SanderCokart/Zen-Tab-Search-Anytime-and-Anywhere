import type { TodoTab } from "@/features/todos/model/todo";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { hostname } from "@/features/search/ui/lib/format";
import { TodoIcon } from "@/features/todos/ui/TodoIcon";
import { formatTabDisplayTitle, type TabInfo } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

/**
 * The third overlay column: tabs marked as todo, then the ones marked done.
 * Clicking a row switches to its tab.
 */
export function TodoNavigator({
  todo,
  done,
  backgroundColor,
  truncate,
  selectedIndex,
  onActivate,
  onSelect,
}: {
  todo: TodoTab[];
  done: TodoTab[];
  backgroundColor: string;
  truncate: boolean;
  selectedIndex: number;
  onActivate: (tab: TabInfo) => void;
  onSelect: (index: number) => void;
}) {
  const total = todo.length + done.length;

  const renderRows = (entries: TodoTab[], startIndex: number) =>
    entries.map(({ tab, status }, offset) => {
      const entryIndex = startIndex + offset;
      const selected = selectedIndex === entryIndex;
      return (
        <button
          key={tab.id ?? tab.domId ?? tab.url}
          type="button"
          class={cn(
            "hover:bg-zen-line-soft flex w-full max-w-full min-w-0 cursor-pointer items-start gap-[var(--zen-space-2)] overflow-hidden rounded-[var(--zen-radius)] border-0 bg-transparent p-[var(--zen-space-2)] text-left font-[inherit] text-inherit",
            selected && "bg-zen-line-soft",
          )}
          data-todo-status={status}
          data-todo-selected={selected ? "true" : undefined}
          ref={(element) => {
            if (selected) {
              element?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
          }}
          onClick={() => onActivate(tab)}
          onFocus={() => onSelect(entryIndex)}
          title={tab.url}
        >
          <TodoIcon
            status={status}
            class={cn(
              "mt-px size-[var(--zen-icon-sm)] shrink-0",
              status === "done" ? "text-zen-subtle" : "text-zen-lavender",
            )}
          />
          <span class="flex min-w-0 flex-1 flex-col">
            <span
              class={cn(
                "block min-w-0 text-[length:var(--zen-text-base)]",
                entryTextClass(truncate),
                status === "done" && "text-zen-subtle line-through",
              )}
            >
              {formatTabDisplayTitle(tab)}
            </span>
            <span
              class={cn(
                "text-zen-subtle block min-w-0 text-[length:var(--zen-text-sm)]",
                entryTextClass(truncate),
              )}
            >
              {tab.workspaceName || hostname(tab.url)}
            </span>
          </span>
        </button>
      );
    });

  return (
    <aside
      class="border-zen-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--zen-radius-lg)] border p-[var(--zen-space-2)]"
      style={{ backgroundColor }}
      data-testid="zen-todo-column"
    >
      <div class="mb-[var(--zen-space-2)] flex min-w-0 items-center justify-between gap-[var(--zen-space-2)]">
        <strong class="min-w-0 truncate text-[length:var(--zen-text-base)]">Todos</strong>
        <span class="text-zen-lavender shrink-0 text-[length:var(--zen-text-sm)]">
          {todo.length} to do · {done.length} done
        </span>
      </div>
      <div class="zen-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {total === 0 ? (
          <p class="text-zen-muted m-0 py-[var(--zen-space-3)] text-center text-[length:var(--zen-text-sm)]">
            No todos yet. Use the todo button on a tab or its right-click menu to add one.
          </p>
        ) : (
          <div class="flex min-w-0 flex-col gap-[var(--zen-space-3)]">
            {todo.length > 0 && (
              <section class="min-w-0">
                <div class="text-zen-muted mb-[var(--zen-space-1)] px-[var(--zen-space-2)] text-[length:var(--zen-text-sm)] font-semibold uppercase">
                  To do
                </div>
                {renderRows(todo, 0)}
              </section>
            )}
            {done.length > 0 && (
              <section class="min-w-0">
                <div class="text-zen-muted mb-[var(--zen-space-1)] px-[var(--zen-space-2)] text-[length:var(--zen-text-sm)] font-semibold uppercase">
                  Done
                </div>
                {renderRows(done, todo.length)}
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
