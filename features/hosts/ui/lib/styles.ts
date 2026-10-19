import { cn } from "@/shared/ui/cn";
import {
  clearButtonClass,
  primaryButtonClass as basePrimaryButtonClass,
} from "@/features/search/ui/lib/styles";

const controlSize = "h-[calc(var(--zen-font-size)*2*var(--zen-scale))] px-[var(--zen-space-2)]";

export const fieldClass = cn(
  "border-zen-line bg-zen-chip placeholder:text-zen-muted w-full rounded-[var(--zen-radius)] border font-[inherit] text-inherit",
  controlSize,
);

export const primaryButtonClass = cn(basePrimaryButtonClass, controlSize);

export const secondaryButtonClass = cn(clearButtonClass, controlSize);

/** The on/off switch of a group; on is amber to match the toolbar badge. */
export function toggleButtonClass(enabled: boolean): string {
  return cn(
    "cursor-pointer rounded-full border font-[inherit] font-semibold",
    "px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-xs)]",
    enabled
      ? "border-amber-500 bg-amber-700 text-white hover:bg-amber-600"
      : "border-zen-line bg-zen-chip text-zen-subtle hover:border-zen-border",
  );
}

/** One half of the "This tab / All tabs" switch in the editor form. */
export function scopeButtonClass(selected: boolean): string {
  return cn(
    "flex-1 cursor-pointer rounded-md border font-[inherit]",
    "px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-xs)]",
    selected
      ? "border-zen-border bg-zen-accent text-inherit"
      : "border-zen-line bg-zen-chip text-zen-subtle hover:border-zen-border",
  );
}
