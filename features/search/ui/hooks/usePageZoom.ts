import { useEffect, useState } from "preact/hooks";
import { normalizeZoom } from "@/features/settings/model/ui-scale";
import { sendExtensionMessage, subscribeToTabZoomChanged } from "@/shared/messaging/client";

/** A zoom change also resizes the page, so a burst of both is read once. */
const REREAD_DELAY_MS = 120;

/**
 * The zoom factor of the tab the overlay sits in (1 is 100%), kept current while
 * `enabled`. The background reads it with `tabs.getZoom` and announces changes from
 * `tabs.onZoomChange`; a window resize re-reads it too, in case the broadcast does
 * not reach a content script. Until the first answer, and whenever the answer is
 * missing or fails, it is 1.
 */
export function usePageZoom(enabled: boolean): number {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!enabled) {
      setZoom(1);
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      sendExtensionMessage({ type: "getTabZoom" })
        .then((value) => {
          if (!cancelled) setZoom(normalizeZoom(value));
        })
        .catch(() => {
          // No answer: keep the size already showing.
        });
    };
    const readSoon = () => {
      clearTimeout(timeout);
      timeout = setTimeout(read, REREAD_DELAY_MS);
    };

    read();
    const unsubscribe = subscribeToTabZoomChanged(readSoon);
    window.addEventListener("resize", readSoon);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      unsubscribe();
      window.removeEventListener("resize", readSoon);
    };
  }, [enabled]);

  return zoom;
}
