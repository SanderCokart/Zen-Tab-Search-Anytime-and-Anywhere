import type { ComponentChildren, JSX } from "preact";
import { useState } from "preact/hooks";
import "@/shared/ui/hardware/menu.css";
import { cn } from "@/shared/ui/cn";
import { useCloseOnOutsideClick } from "@/shared/ui/hooks/useCloseOnOutsideClick";
import { TooltipLegend, useTooltip } from "@/shared/ui/primitives/Tooltip";

export type MenuItemProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "class" | "title"> & {
  class?: string;
  tooltip?: ComponentChildren;
};

/** A menu row with the hardware option treatment and optional LCD tooltip. */
export function MenuItem({ tooltip, class: className, children, ...rest }: MenuItemProps) {
  const { anchor, show, hide, showAfterPause } = useTooltip();

  return (
    <>
      <button
        {...rest}
        type="button"
        class={className}
        data-kit="option"
        onMouseEnter={(event) => {
          showAfterPause(event.currentTarget);
        }}
        onMouseLeave={hide}
        onFocus={(event) => {
          show(event.currentTarget);
        }}
        onBlur={hide}
        onClick={(event) => {
          hide();
          rest.onClick?.(event);
        }}
      >
        {children}
      </button>
      {tooltip !== undefined && anchor && <TooltipLegend content={tooltip} anchor={anchor} />}
    </>
  );
}

/**
 * Open state for a dropdown whose trigger and panel sit inside the element that
 * matches `wrapSelector`; a press outside it closes the menu.
 */
export function useDropdown(wrapSelector: string): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  useCloseOnOutsideClick(open, wrapSelector, () => setOpen(false));
  return {
    open,
    toggle: () => setOpen((current) => !current),
    close: () => setOpen(false),
  };
}

export type MenuPanelProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "role"> & {
  /** Which edge of the trigger's wrapper the panel lines up with. */
  align: "left" | "right";
  class?: string;
};

/** The floating `zs-menu` panel under a dropdown trigger. Put it in a `relative` wrapper. */
export function MenuPanel({ align, class: className, children, ...rest }: MenuPanelProps) {
  return (
    <div
      {...rest}
      role="menu"
      class={cn(
        "zs-menu absolute top-full z-50 mt-[var(--zen-space-2)]",
        align === "right" ? "right-0" : "left-0",
        "flex flex-col p-[var(--zen-space-1)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
