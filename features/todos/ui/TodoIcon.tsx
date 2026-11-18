import { cn } from "@/shared/ui/cn";
import "@/shared/ui/hardware/checkbox.css";

/**
 * A small hardware checkbox key: a recessed square well with an indicator
 * dot when off and a latching tick when on.
 */
export function TodoIcon({
  checked = false,
  class: className,
}: {
  checked?: boolean;
  class?: string;
}) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <rect class="zs-checkbox-icon-key" x="3" y="3" width="18" height="18" rx="3" />
      <rect class="zs-checkbox-icon-well" x="5" y="5" width="14" height="14" rx="2" />
      {checked ? (
        <path class="zs-checkbox-icon-tick" data-checkbox-tick="" d="M8 12.25l2.5 2.5L16.25 9" />
      ) : (
        <circle
          class="zs-checkbox-icon-indicator"
          data-checkbox-indicator=""
          cx="8"
          cy="8"
          r="1.5"
        />
      )}
    </svg>
  );
}
