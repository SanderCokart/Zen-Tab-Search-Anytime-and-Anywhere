import { cn } from "@/shared/ui/cn";
import {
  clearButtonClass,
  primaryButtonClass as basePrimaryButtonClass,
} from "@/features/search/ui/lib/styles";

const controlSize = "h-[calc(var(--zen-font-size)*2*var(--zen-scale))] px-[var(--zen-space-2)]";

export const fieldClass = cn(
  "zs-well border-zen-line-soft placeholder:text-zen-muted w-full rounded-[var(--zs-r-lcd)] border font-[inherit] text-inherit outline-none focus:border-zen-accent",
  controlSize,
);

export const primaryButtonClass = cn(basePrimaryButtonClass, controlSize);

export const secondaryButtonClass = cn(clearButtonClass, controlSize);

/** The on/off switch of a group: a latching key, pressed in while the override is on. */
export function toggleButtonClass(enabled: boolean): string {
  return cn(
    "zs-key font-[inherit] font-semibold uppercase tracking-wider",
    "px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-sm)]",
    !enabled && "text-zen-subtle",
  );
}

/** One half of the "This tab / All tabs" switch in the editor form. */
export function scopeButtonClass(selected: boolean): string {
  return cn(
    "zs-key flex-1 font-[inherit]",
    "px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-[length:var(--zen-text-sm)]",
    !selected && "text-zen-subtle",
  );
}
