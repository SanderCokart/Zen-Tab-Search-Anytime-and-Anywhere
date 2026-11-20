/**
 * A ref callback that scrolls its element into view while `active` is true, by
 * the least distance. Tolerates elements without `scrollIntoView` (test DOMs).
 */
export function scrollIntoViewWhen(
  active: boolean,
  options: ScrollIntoViewOptions = { block: "nearest", inline: "nearest" },
): (element: HTMLElement | null) => void {
  return (element) => {
    if (active && typeof element?.scrollIntoView === "function") {
      element.scrollIntoView(options);
    }
  };
}
