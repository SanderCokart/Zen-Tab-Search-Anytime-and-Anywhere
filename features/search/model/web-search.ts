export const SEARCH_ENGINES = [
  {
    id: "google",
    name: "Google",
    shortLabel: "Google",
    template: "https://www.google.com/search?q=%s",
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    shortLabel: "DDG",
    template: "https://duckduckgo.com/?q=%s",
  },
  {
    id: "bing",
    name: "Bing",
    shortLabel: "Bing",
    template: "https://www.bing.com/search?q=%s",
  },
  {
    id: "brave",
    name: "Brave",
    shortLabel: "Brave",
    template: "https://search.brave.com/search?q=%s",
  },
  {
    id: "kagi",
    name: "Kagi",
    shortLabel: "Kagi",
    template: "https://kagi.com/search?q=%s",
  },
  {
    id: "startpage",
    name: "Startpage",
    shortLabel: "Startpage",
    template: "https://www.startpage.com/sp/search?query=%s",
  },
  {
    id: "ecosia",
    name: "Ecosia",
    shortLabel: "Ecosia",
    template: "https://www.ecosia.org/search?q=%s",
  },
] as const;

export type SearchEngineId = (typeof SEARCH_ENGINES)[number]["id"];

export const SEARCH_ENGINE_IDS = [
  "google",
  "duckduckgo",
  "bing",
  "brave",
  "kagi",
  "startpage",
  "ecosia",
] as const satisfies readonly SearchEngineId[];

export const DEFAULT_SEARCH_ENGINE: SearchEngineId = "google";

export type SearchEngine = (typeof SEARCH_ENGINES)[number];

export function isSearchEngineId(value: string): value is SearchEngineId {
  return (SEARCH_ENGINE_IDS as readonly string[]).includes(value);
}

/** The named engine, or Google when the stored id is missing or unknown. */
export function searchEngineById(id: string | undefined): SearchEngine {
  const match = SEARCH_ENGINES.find((engine) => engine.id === id);
  if (match) {
    return match;
  }
  const fallback = SEARCH_ENGINES.find((engine) => engine.id === DEFAULT_SEARCH_ENGINE);
  if (!fallback) {
    throw new Error("Default search engine is missing.");
  }
  return fallback;
}

/**
 * The engine's search URL for this query, or undefined when there is nothing
 * to look up. `%s` in the template is the encoded query.
 */
export function webSearchUrl(engineId: string | undefined, query: string): string | undefined {
  const trimmed = query.trim();
  if (!trimmed) {
    return undefined;
  }
  return searchEngineById(engineId).template.replace("%s", encodeURIComponent(trimmed));
}
