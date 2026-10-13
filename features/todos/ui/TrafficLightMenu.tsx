import { useRef } from "preact/hooks";
import { useClampedPosition } from "@/features/search/ui/hooks/useClampedPosition";
import { TRAFFIC_LIGHT_OPTIONS } from "@/features/todos/model/todo";
import { trafficLightDotClass } from "@/features/todos/ui/traffic-light";
import type { TrafficLight } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export const TRAFFIC_LIGHT_MENU_SELECTOR = "[data-testid='zen-traffic-light-menu']";
/** Matches the buttons that open the menu, so clicking one again closes it instead of reopening it. */
export const TRAFFIC_LIGHT_TRIGGER_SELECTOR = "[data-traffic-light-trigger]";

export interface TrafficLightMenuProps {
  x: number;
  y: number;
  light?: TrafficLight;
  /** "none" clears the todo's traffic light. */
  onSelect: (light: TrafficLight | "none") => void;
}

const itemClass =
  "hover:bg-zen-line-soft flex w-full cursor-pointer items-center gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] border-0 bg-transparent px-[var(--zen-space-3)] py-[var(--zen-space-2)] text-left font-[inherit] text-inherit text-[length:var(--zen-text-md)]";

/** The dropdown under a todo's traffic-light button: pick red, orange or green, or clear it. */
export function TrafficLightMenu({ x, y, light, onSelect }: TrafficLightMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useClampedPosition(menuRef, x, y);

  return (
    <div
      ref={menuRef}
      class="bg-zen-panel border-zen-line-medium fixed z-50 min-w-[140px] rounded-md border p-1 shadow-lg"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      data-testid="zen-traffic-light-menu"
      role="menu"
      aria-label="Todo status"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {TRAFFIC_LIGHT_OPTIONS.map((option) => (
        <button
          key={option.light}
          type="button"
          class={cn(itemClass, light === option.light && "bg-zen-line-soft")}
          role="menuitemradio"
          aria-checked={light === option.light}
          title={`Mark this todo ${option.label.toLowerCase()}`}
          data-traffic-light={option.light}
          onClick={() => onSelect(option.light)}
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
        <>
          <div class="bg-zen-line-soft my-1 h-px" role="separator" />
          <button
            type="button"
            class={itemClass}
            role="menuitem"
            title="Remove this todo's status color"
            data-traffic-light="none"
            onClick={() => onSelect("none")}
          >
            No status
          </button>
        </>
      )}
    </div>
  );
}
