/** Shared Tailwind class recipes for the search surfaces. */

/** A full-size hardware keycap; callers add the padding or size. */
export const primaryButtonClass = "zs-key font-[inherit]";

/** The secondary key: the same hardware with quieter text. */
export { clearButtonClass } from "@/shared/ui/button-styles";

/** A small icon key, as on a tab row. */
export const miniKeyClass =
  "zs-key zs-key-mini relative inline-flex items-center justify-center p-0 font-[inherit]";

/**
 * Whether a result's own text is cut to one line or allowed to wrap.
 *
 * Only the entry text itself takes this — section headers and group labels stay
 * truncated either way, so turning wrapping on cannot make the chrome reflow.
 */
export function entryTextClass(truncate: boolean): string {
  return truncate ? "truncate" : "break-words";
}
