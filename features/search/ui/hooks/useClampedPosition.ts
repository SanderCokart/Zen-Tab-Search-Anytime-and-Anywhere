import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";

/**
 * Where to place a fixed popup opened at `x`/`y`: the pointer position, shifted
 * left or up when the popup would overflow the viewport.
 */
export function useClampedPosition(ref: RefObject<HTMLElement>, x: number, y: number) {
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    setPosition({
      left: Math.max(0, Math.min(x, window.innerWidth - (rect?.width ?? 0))),
      top: Math.max(0, Math.min(y, window.innerHeight - (rect?.height ?? 0))),
    });
  }, [ref, x, y]);
  return position;
}
