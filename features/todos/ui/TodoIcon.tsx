import { useId } from "preact/hooks";
import { cn } from "@/shared/ui/cn";

/**
 * A task list: two ticked boxes beside two lines. The outline version is a tab
 * that is not a todo; `filled` is the solid version for one that is.
 */
export function TodoIcon({
  filled = false,
  class: className,
}: {
  filled?: boolean;
  class?: string;
}) {
  const maskId = useId();

  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      {filled ? (
        <>
          {/* The ticks are cut out of the solid boxes, so they show whatever is behind. */}
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="white" stroke="none" />
            <path d="M5 6.5l1.5 1.5 2-2.5M5 17.5l1.5 1.5 2-2.5" stroke="black" />
          </mask>
          <g mask={`url(#${maskId})`}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" />
          </g>
        </>
      ) : (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <path d="M5 6.5l1.5 1.5 2-2.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M5 17.5l1.5 1.5 2-2.5" />
        </>
      )}
      <path d="M14 6.5h7M14 17.5h7" />
    </svg>
  );
}
