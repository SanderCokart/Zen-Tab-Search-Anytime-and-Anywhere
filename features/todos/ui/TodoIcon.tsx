import type { TodoStatus } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

/** An empty box for a tab with no todo, a box with a tick once it is done. */
export function TodoIcon({ status, class: className }: { status?: TodoStatus; class?: string }) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      {status === "done" && <path d="M8 12l3 3 5-6" />}
      {status === "todo" && <path d="M8 12h8" />}
    </svg>
  );
}
