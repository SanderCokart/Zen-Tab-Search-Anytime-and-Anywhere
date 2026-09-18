import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { canRenameTab, tabBrowserId, type TabInfo } from "@/shared/types";

export interface TabContextMenuProps {
  tab: TabInfo;
  x: number;
  y: number;
  onRename: () => void;
  onOpenTimer: (tabId: number) => void;
}

const itemClass =
  "hover:bg-zen-line-soft flex w-full cursor-pointer items-center gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] px-[var(--zen-space-3)] py-[var(--zen-space-2)] text-left font-[inherit] text-[length:var(--zen-text-md)]";

/** Right-click menu for a tab row. */
export function TabContextMenu({ tab, x, y, onRename, onOpenTimer }: TabContextMenuProps) {
  const tabId = tabBrowserId(tab);

  return (
    <div
      class="bg-zen-panel border-zen-line-medium fixed z-50 min-w-[180px] rounded-md border p-1 shadow-lg"
      style={{ left: `${x}px`, top: `${y}px` }}
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
    </div>
  );
}
