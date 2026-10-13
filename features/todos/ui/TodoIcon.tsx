import { cn } from "@/shared/ui/cn";

/** A task list: two ticked boxes beside two lines. */
export function TodoIcon({ class: className }: { class?: string }) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <path d="M5 6.5l1.5 1.5 2-2.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M5 17.5l1.5 1.5 2-2.5" />
      <path d="M14 6.5h7M14 17.5h7" />
    </svg>
  );
}
