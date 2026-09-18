/** Shared Tailwind class recipes for the search surfaces. */
export const primaryButtonClass =
  "cursor-pointer rounded-md border border-zen-border bg-zen-accent font-[inherit] text-inherit hover:bg-zen-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export const clearButtonClass =
  "cursor-pointer rounded-md border border-zen-clear bg-transparent font-[inherit] text-zen-faint hover:bg-zen-surface-faint";

/**
 * Whether a result's own text is cut to one line or allowed to wrap.
 *
 * Only the entry text itself takes this — section headers and group labels stay
 * truncated either way, so turning wrapping on cannot make the chrome reflow.
 */
export function entryTextClass(truncate: boolean): string {
  return truncate ? "truncate" : "break-words";
}

export const projectBorderColors = [
  "border-red-400",
  "border-orange-400",
  "border-yellow-400",
  "border-green-400",
  "border-blue-400",
  "border-purple-400",
  "border-pink-400",
];
