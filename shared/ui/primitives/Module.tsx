import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { cn } from "@/shared/ui/cn";

/**
 * One card of the settings grid: a numbered, uppercase header with a hairline
 * rule, over its controls. The number is a CSS counter that `.zs-mod-grid`
 * resets, so it follows render order.
 */
export function Module({
  title,
  meta,
  wide = false,
  class: className,
  children,
}: {
  title: string;
  /** Quiet text at the right end of the header. */
  meta?: string;
  /** Spans both columns of the grid. */
  wide?: boolean;
  class?: string;
  children?: ComponentChildren;
}) {
  const headingId = useId();
  return (
    <section
      class={cn("zs-card p-[var(--zen-space-4)]", wide && "zs-mod-wide", className)}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} class="zs-mod-head">
        {title}
        {meta && <span class="zs-mod-meta">{meta}</span>}
      </h2>
      <div class="flex flex-col gap-[var(--zen-space-4)] pt-[var(--zen-space-4)]">{children}</div>
    </section>
  );
}

/** A label with an optional hint under it, in the page's body face. */
export function FieldText({ label, hint }: { label: string; hint?: string }) {
  return (
    <span class="block font-[family-name:var(--font-title)]">
      <span class="block leading-tight font-medium">{label}</span>
      {hint && (
        <span class="mt-[var(--zen-space-1)] block text-[length:var(--zen-text-sm)] leading-snug text-[var(--zs-ink-3)]">
          {hint}
        </span>
      )}
    </span>
  );
}
