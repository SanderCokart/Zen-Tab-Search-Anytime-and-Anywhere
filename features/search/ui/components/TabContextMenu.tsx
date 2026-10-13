import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import type { TodoStatus } from "@/shared/types";
import { canRenameTab, tabBrowserId, isEssentialTab, type TabInfo } from "@/shared/types";

export interface TabContextMenuProps {
  tab: TabInfo;
  x: number;
  y: number;
  /** "todo" shows only the todo options, for the todo button. */
  scope?: "all" | "todo";
  todoStatus?: TodoStatus;
  onRename: () => void;
  onOpenTimer: (tabId: number) => void;
  onSetTodo: (status: TodoStatus | "none") => void;
}

const itemClass =
  "hover:bg-zen-line-soft flex w-full cursor-pointer items-center gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] px-[var(--zen-space-3)] py-[var(--zen-space-2)] text-left font-[inherit] text-[length:var(--zen-text-md)]";

/** Menu for a tab row: from the right-click, or from the todo button. */
export function TabContextMenu({
  tab,
  x,
  y,
  scope = "all",
  todoStatus,
  onRename,
  onOpenTimer,
  onSetTodo,
}: TabContextMenuProps) {
  const tabId = tabBrowserId(tab);
  const showGeneral = scope === "all";
  const canTodo = tabId !== undefined && !isEssentialTab(tab);

  return (
    <div
      class="bg-zen-panel border-zen-line-medium fixed z-50 min-w-[180px] rounded-md border p-1 shadow-lg"
      style={{ left: `${x}px`, top: `${y}px` }}
      data-testid="zen-tab-context-menu"
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {showGeneral && canRenameTab(tab) && (
        <button type="button" class={itemClass} role="menuitem" onClick={onRename}>
          <span aria-hidden="true">✎</span>
          Rename
        </button>
      )}
      {showGeneral && tabId !== undefined && (
        <button type="button" class={itemClass} role="menuitem" onClick={() => onOpenTimer(tabId)}>
          <TimerIcon class="size-[var(--zen-icon-md)]" />
          Timer
        </button>
      )}
      {canTodo && (
        <>
          {showGeneral && <div class="bg-zen-line-soft my-1 h-px" role="separator" />}
          {todoStatus !== "todo" && (
            <button
              type="button"
              class={itemClass}
              role="menuitem"
              onClick={() => onSetTodo("todo")}
            >
              Mark as todo
            </button>
          )}
          {todoStatus !== "done" && (
            <button
              type="button"
              class={itemClass}
              role="menuitem"
              onClick={() => onSetTodo("done")}
            >
              Mark as done
            </button>
          )}
          {todoStatus && (
            <button
              type="button"
              class={itemClass}
              role="menuitem"
              onClick={() => onSetTodo("none")}
            >
              Remove todo
            </button>
          )}
        </>
      )}
    </div>
  );
}
