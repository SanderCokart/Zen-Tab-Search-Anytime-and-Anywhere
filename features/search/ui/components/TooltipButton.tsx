import type { ComponentChildren, JSX } from "preact";
import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";
import { cn } from "@/shared/ui/cn";

type TooltipAnchor = { rect: DOMRect; container: Element };

export type TooltipButtonProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, "title" | "class"> & {
  /** The accessible name. Also the tooltip text unless `tooltip` says more. */
  label: string;
  tooltip?: ComponentChildren;
  class?: string;
};

/**
 * Where the tooltip goes: above the button and right-aligned with it, flipping
 * below or to the left edge when it would run off the top or the left.
 */
function tooltipStyle({ rect }: TooltipAnchor): JSX.CSSProperties {
  const below = rect.top < 48;
  const alignLeft = rect.right < 240;
  return {
    left: `${alignLeft ? rect.left : rect.right}px`,
    top: `${below ? rect.bottom + 4 : rect.top - 4}px`,
    transform: `translate(${alignLeft ? "0" : "-100%"}, ${below ? "0" : "-100%"})`,
  };
}

/**
 * An icon button with a styled tooltip. The tooltip is portalled to the search
 * surface's root and fixed to the viewport, so a row's `overflow-hidden`, its
 * paint containment and the column's scroll area cannot clip it. It shows on
 * hover and keyboard focus, and hides once the button is clicked.
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
  ...rest
}: TooltipButtonProps) {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const show = (element: HTMLElement) =>
    setAnchor({
      rect: element.getBoundingClientRect(),
      container: element.closest("[data-zen-ui]") ?? document.body,
    });
  const hide = () => setAnchor(null);

  return (
    <>
      <button
        type="button"
        {...rest}
        aria-label={label}
        class={className}
        onMouseEnter={(event) => {
          show(event.currentTarget);
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
      {anchor &&
        createPortal(
          <span
            role="tooltip"
            class={cn(
              "bg-zen-tooltip pointer-events-none fixed z-50 w-max max-w-[220px] rounded px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-xs)] text-white shadow",
            )}
            style={tooltipStyle(anchor)}
          >
            {tooltip ?? label}
          </span>,
          anchor.container,
        )}
    </>
  );
}
