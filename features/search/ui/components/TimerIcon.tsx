import { cn } from "@/shared/ui/cn";

export function TimerIcon({
  close = false,
  class: className,
}: {
  close?: boolean;
  class?: string;
}) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      {close ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5M9 3h6M12 3v2" />
        </>
      )}
    </svg>
  );
}
