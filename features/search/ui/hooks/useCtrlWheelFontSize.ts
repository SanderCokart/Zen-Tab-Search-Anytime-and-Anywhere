import { useEffect, useRef } from "preact/hooks";
import {
  saveDisplaySettings,
  type DisplaySettings,
} from "@/features/settings/model/display-settings";
import { stepFontSize } from "@/features/settings/model/ui-scale";

/**
 * Ctrl + mouse wheel over `target` grows or shrinks the font size, one pixel a
 * notch, and saves it like any other display setting. The listener is not passive
 * so the wheel can cancel the browser's own Ctrl + wheel page zoom.
 */
export function useCtrlWheelFontSize(
  target: { current: HTMLElement | null },
  displaySettings: DisplaySettings,
  enabled: boolean,
): void {
  // Kept current by hand, not on every render: a fast burst of notches must step
  // from the value just saved, not from a prop the storage event has not caught up to.
  const latest = useRef(displaySettings);

  useEffect(() => {
    latest.current = displaySettings;
  }, [displaySettings]);

  useEffect(() => {
    const element = target.current;
    if (!enabled || !element) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const next = stepFontSize(latest.current.fontSize, event.deltaY);
      if (next === latest.current.fontSize) return;
      latest.current = { ...latest.current, fontSize: next };
      void saveDisplaySettings(latest.current);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [enabled, target]);
}
