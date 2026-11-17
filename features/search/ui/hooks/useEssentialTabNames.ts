import { useEffect, useState } from "preact/hooks";
import {
  ESSENTIAL_TAB_NAMES_KEY,
  parseEssentialTabNames,
} from "@/features/search/model/essential-tab-names";

export { ESSENTIAL_TAB_NAMES_KEY };

/**
 * User-chosen names for essential tabs. Zen does not expose a writable label for
 * them, so the extension stores its own names keyed by the tab's DOM id.
 */
export function useEssentialTabNames() {
  const [essentialNames, setEssentialNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void browser.storage.local.get(ESSENTIAL_TAB_NAMES_KEY).then((stored) => {
      setEssentialNames(parseEssentialTabNames(stored[ESSENTIAL_TAB_NAMES_KEY]));
    });
  }, []);

  return { essentialNames, setEssentialNames };
}
