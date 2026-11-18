import type { ComponentChildren, JSX } from "preact";
import "@/shared/ui/hardware/menu.css";
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
