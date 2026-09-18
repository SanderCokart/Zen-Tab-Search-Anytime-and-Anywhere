import { useEffect, useRef } from "preact/hooks";

/**
 * Calls `onOutsideClick` when a pointer-down lands outside `insideSelector`,
 * while `active` is true.
 *
 * The callback is held in a ref so callers can pass an inline arrow without
 * re-subscribing the document listener on every render.
 */
export function useCloseOnOutsideClick(
  active: boolean,
  insideSelector: string,
  onOutsideClick: () => void,
): void {
  const callbackRef = useRef(onOutsideClick);
  callbackRef.current = onOutsideClick;

  useEffect(() => {
    if (!active) {
      return;
    }
    const handle = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(insideSelector)) {
        return;
      }
      callbackRef.current();
    };
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [active, insideSelector]);
}
