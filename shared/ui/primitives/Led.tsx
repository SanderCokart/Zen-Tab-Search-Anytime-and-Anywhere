import { cn } from "@/shared/ui/cn";

/** A small indicator lamp: dim when off, a glowing red when on. */
export function Led({ on = false, class: className }: { on?: boolean; class?: string }) {
  return <span aria-hidden="true" class={cn("zs-led", className)} data-on={on || undefined} />;
}
