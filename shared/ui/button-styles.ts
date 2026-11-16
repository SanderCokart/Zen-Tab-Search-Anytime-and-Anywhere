/** Tailwind class recipes for hardware keys that more than one feature uses. */

/** The secondary key: a hardware keycap with quieter text; callers add the padding. */
export const clearButtonClass = "zs-key font-[inherit] text-zen-faint";

/** A labelled key on the settings page: uppercase micro text on a keycap. */
export const settingsKeyClass =
  "zs-key zs-label inline-flex items-center gap-[var(--zen-space-2)] px-[var(--zen-space-3)] py-[var(--zen-space-2)] font-[inherit] whitespace-nowrap text-[var(--zs-ink-1)] no-underline";
