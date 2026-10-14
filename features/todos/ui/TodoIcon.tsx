import { useId } from "preact/hooks";
import { cn } from "@/shared/ui/cn";

/**
 * A checkbox: empty for a tab that is not a todo, and `checked` — a solid box
 * with the tick cut out — for one that is.
 */
export function TodoIcon({
  checked = false,
  class: className,
}: {
  checked?: boolean;
  class?: string;
}) {
  const maskId = useId();

  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      {checked ? (
        <>
          {/* The tick is cut out of the solid box, so it shows whatever is behind. */}
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="white" stroke="none" />
            <path d="M8 12.5l2.75 2.75L16.5 9.5" stroke="black" />
          </mask>
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            rx="3"
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
        </>
      ) : (
        <rect x="4" y="4" width="16" height="16" rx="3" />
      )}
    </svg>
  );
}
