import type { ComponentChildren, JSX } from "preact";
import { TooltipLegend, useTooltip } from "@/shared/ui/primitives/Tooltip";

export type TooltipButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "title" | "class"
> & {
  /** The accessible name. Also the tooltip text unless `tooltip` says more. */
  label: string;
  tooltip?: ComponentChildren;
  class?: string;
};

/**
 * An icon button with a Spec-01 hardware tooltip: a small LCD above the key
 * whose characters print in on hover. The legend is portalled to the search
 * surface's root and fixed to the viewport, so a row's `overflow-hidden`, its
 * paint containment and the column's scroll area cannot clip it. It shows on
 * hover, after a short pause so a fast pass does not spawn one per row, on
 * keyboard focus immediately, and hides once the button is clicked.
 */
export function TooltipButton({
  label,
  tooltip,
  class: className,
  children,
  onClick,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
  "aria-label": ariaLabel,
  ...rest
}: TooltipButtonProps) {
  const { anchor, show, hide, showAfterPause } = useTooltip();

  return (
    <>
      <button
        type="button"
        {...rest}
        aria-label={ariaLabel ?? label}
        class={className}
        onMouseEnter={(event) => {
          showAfterPause(event.currentTarget);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          hide();
          onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          show(event.currentTarget);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          hide();
          onBlur?.(event);
        }}
        onClick={(event) => {
          hide();
          onClick?.(event);
        }}
      >
        {children}
      </button>
      {anchor && <TooltipLegend content={tooltip ?? label} anchor={anchor} />}
    </>
  );
}
