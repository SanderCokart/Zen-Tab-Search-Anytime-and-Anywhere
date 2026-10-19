import { useEffect, useState } from "preact/hooks";

/**
 * Holds the overlay at its loading stage until the first snapshot and display
 * settings have landed, then waits two animation frames so the real size is
 * committed before it is shown. That hides the layout shift from empty
 * defaults jumping to the loaded columns and scale.
 */
export function useOverlayEntrance(enabled: boolean, ready: boolean): boolean {
  const [open, setOpen] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setOpen(true);
      return;
    }
    if (!ready) {
      setOpen(false);
      return;
    }

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setOpen(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [enabled, ready]);

  return open;
}
