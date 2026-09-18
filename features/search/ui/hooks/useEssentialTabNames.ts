import { useEffect, useState } from "preact/hooks";

export const ESSENTIAL_TAB_NAMES_KEY = "essentialTabNames";

/**
 * User-chosen names for essential tabs. Zen does not expose a writable label for
 * them, so the extension stores its own names keyed by the tab's DOM id.
 */
export function useEssentialTabNames() {
  const [essentialNames, setEssentialNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void browser.storage.local.get(ESSENTIAL_TAB_NAMES_KEY).then((stored) => {
      const names = stored[ESSENTIAL_TAB_NAMES_KEY];
      if (names && typeof names === "object") {
        setEssentialNames(
          Object.fromEntries(
            Object.entries(names).filter(
              ([key, value]) => typeof key === "string" && typeof value === "string",
            ),
          ),
        );
      }
    });
  }, []);

  return { essentialNames, setEssentialNames };
}
