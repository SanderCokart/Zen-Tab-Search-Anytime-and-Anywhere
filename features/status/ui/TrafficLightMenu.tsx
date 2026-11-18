import { useRef } from "preact/hooks";
import { useClampedPosition } from "@/features/search/ui/hooks/useClampedPosition";
import { TRAFFIC_LIGHT_OPTIONS } from "@/features/status/model/status";
import { trafficLightDotClass } from "@/features/status/ui/traffic-light";
import type { TrafficLight } from "@/shared/types";
import { cn } from "@/shared/ui/cn";
import "@/shared/ui/hardware/menu.css";
import { MenuItem } from "@/shared/ui/primitives/Menu";

export const TRAFFIC_LIGHT_MENU_SELECTOR = "[data-testid='zen-traffic-light-menu']";
/** Matches the buttons that open the menu, so clicking one again closes it instead of reopening it. */
export const TRAFFIC_LIGHT_TRIGGER_SELECTOR = "[data-traffic-light-trigger]";

export interface TrafficLightMenuProps {
  x: number;
  y: number;
  light?: TrafficLight;
  /** "none" clears the tab's status color. */
  onSelect: (light: TrafficLight | "none") => void;
}

const itemClass = "zs-hardware-menu-item w-full";

/** The dropdown under a tab's status button: pick red, orange or green, or clear it. */
export function TrafficLightMenu({ x, y, light, onSelect }: TrafficLightMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useClampedPosition(menuRef, x, y);

  return (
    <div
      ref={menuRef}
      class="zs-menu zs-hardware-menu fixed z-50"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      data-testid="zen-traffic-light-menu"
      role="menu"
      aria-label="Todo status"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {TRAFFIC_LIGHT_OPTIONS.map((option) => (
        <MenuItem
          key={option.light}
          class={itemClass}
          role="menuitemradio"
          aria-checked={light === option.light}
          tooltip={`Set the status to ${option.label.toLowerCase()}`}
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
        </MenuItem>
      ))}
      {light !== undefined && (
        <>
          <div class="zs-hardware-menu-separator" role="separator" />
          <MenuItem
            class={itemClass}
            role="menuitem"
            tooltip="Clear this tab's status color"
            data-traffic-light="none"
            onClick={() => onSelect("none")}
          >
            No status
          </MenuItem>
        </>
      )}
    </div>
  );
}
