import { useRef } from "preact/hooks";
import { useClampedPosition } from "@/features/search/ui/hooks/useClampedPosition";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { TRAFFIC_LIGHT_OPTIONS } from "@/features/status/model/status";
import { trafficLightDotClass } from "@/features/status/ui/traffic-light";
import {
  canRenameTab,
  tabBrowserId,
  isEssentialTab,
  type TabInfo,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export interface TabContextMenuProps {
  tab: TabInfo;
  x: number;
  y: number;
  isTodo: boolean;
  /** The tab's status color, if it has one. */
  light?: TrafficLight;
  onRename: () => void;
  onOpenTimer: (tabId: number) => void;
  /** "none" marks the todo done, which removes it. */
  onSetTodo: (status: "todo" | "none") => void;
  /** Sets the tab's status color; "none" clears it. */
  onSetLight: (light: TrafficLight | "none") => void;
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
  light,
  onRename,
  onOpenTimer,
  onSetTodo,
  onSetLight,
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
      {tabId !== undefined && (
        <>
          <div class="bg-zen-line-soft my-1 h-px" role="separator" />
          <div
            class="text-zen-subtle px-[var(--zen-space-3)] pt-[var(--zen-space-1)] text-[length:var(--zen-text-xs)] font-semibold uppercase"
            role="presentation"
          >
            Status
          </div>
          {TRAFFIC_LIGHT_OPTIONS.map((option) => (
            <button
              key={option.light}
              type="button"
              class={cn(itemClass, light === option.light && "bg-zen-line-soft")}
              role="menuitemradio"
              aria-checked={light === option.light}
              data-traffic-light={option.light}
              onClick={() => onSetLight(option.light)}
            >
              <span
                aria-hidden="true"
                class={cn(
                  "size-[var(--zen-icon-sm)] shrink-0 rounded-full",
                  trafficLightDotClass[option.light],
                )}
              />
              {option.label}
            </button>
          ))}
          {light !== undefined && (
            <button
              type="button"
              class={itemClass}
              role="menuitem"
              data-traffic-light="none"
              onClick={() => onSetLight("none")}
            >
              No status
            </button>
          )}
        </>
      )}
    </div>
  );
}
