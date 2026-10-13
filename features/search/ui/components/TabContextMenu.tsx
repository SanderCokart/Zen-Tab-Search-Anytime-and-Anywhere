import { useRef } from "preact/hooks";
import { useClampedPosition } from "@/features/search/ui/hooks/useClampedPosition";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { canRenameTab, tabBrowserId, isEssentialTab, type TabInfo } from "@/shared/types";

export interface TabContextMenuProps {
  tab: TabInfo;
  x: number;
  y: number;
  isTodo: boolean;
  onRename: () => void;
  onOpenTimer: (tabId: number) => void;
  /** "none" marks the todo done, which removes it. */
  onSetTodo: (status: "todo" | "none") => void;
}

const itemClass =
  "hover:bg-zen-line-soft flex w-full cursor-pointer items-center gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] px-[var(--zen-space-3)] py-[var(--zen-space-2)] text-left font-[inherit] text-[length:var(--zen-text-md)]";

/**
 * Right-click menu for a tab, opened from the result rows, the issue column and
 * the todo column. `x`/`y` are the pointer position; the menu shifts left or up
 * when it would overflow the viewport.
 */
export function TabContextMenu({
  tab,
  x,
  y,
  isTodo,
  onRename,
  onOpenTimer,
  onSetTodo,
}: TabContextMenuProps) {
  const tabId = tabBrowserId(tab);
  const canTodo = tabId !== undefined && !isEssentialTab(tab);

  const menuRef = useRef<HTMLDivElement>(null);
  const position = useClampedPosition(menuRef, x, y);

  return (
    <div
      ref={menuRef}
      class="bg-zen-panel border-zen-line-medium fixed z-50 min-w-[180px] rounded-md border p-1 shadow-lg"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      data-testid="zen-tab-context-menu"
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {canRenameTab(tab) && (
        <button type="button" class={itemClass} role="menuitem" onClick={onRename}>
          <span aria-hidden="true">✎</span>
          Rename
        </button>
      )}
      {tabId !== undefined && (
        <button type="button" class={itemClass} role="menuitem" onClick={() => onOpenTimer(tabId)}>
          <TimerIcon class="size-[var(--zen-icon-md)]" />
          Timer
        </button>
      )}
      {canTodo && (
        <>
          <div class="bg-zen-line-soft my-1 h-px" role="separator" />
          <button
            type="button"
            class={itemClass}
            role="menuitem"
            onClick={() => onSetTodo(isTodo ? "none" : "todo")}
          >
            {isTodo ? "Mark as done" : "Mark as todo"}
          </button>
        </>
      )}
    </div>
  );
}
