import { isEssentialTab, type TabInfo } from "@/shared/types";

/** Storage key for user-chosen names of essential tabs, keyed by DOM id. */
export const ESSENTIAL_TAB_NAMES_KEY = "essentialTabNames";

/** Reads a stored name map, dropping anything that is not a string-to-string entry. */
export function parseEssentialTabNames(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

/** Puts an extension-local essential name onto `customLabel` so lists match the omnibar. */
export function applyEssentialTabNames(tabs: TabInfo[], names: Record<string, string>): TabInfo[] {
  return tabs.map((tab) => {
    if (!isEssentialTab(tab) || !tab.domId) {
      return tab;
    }
    const name = names[tab.domId];
    return name ? { ...tab, customLabel: name } : tab;
  });
}
