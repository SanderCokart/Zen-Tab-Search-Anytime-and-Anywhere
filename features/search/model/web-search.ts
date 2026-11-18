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

/**
 * Last labels that are almost always a filename, not a site. `foo.ts` should
 * search; `youtube.com` should open. `.ts` is a real TLD, which is why this
 * list exists instead of "any dot".
 */
const FILE_LIKE_TLDS = new Set([
  "c",
  "css",
  "env",
  "gif",
  "go",
  "h",
  "htm",
  "html",
  "jpeg",
  "jpg",
  "js",
  "json",
  "jsx",
  "lock",
  "log",
  "map",
  "md",
  "mjs",
  "pdf",
  "png",
  "py",
  "rs",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "wasm",
  "webp",
  "xml",
  "yaml",
  "yml",
]);

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const TLD = /^[a-z]{2,63}$/;

function isIpv4(host: string): boolean {
  return IPV4.test(host);
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function isSiteHost(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  if (isLocalHost(host) || isIpv4(host)) {
    return true;
  }
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (labels.length < 2 || tld === undefined || !TLD.test(tld) || FILE_LIKE_TLDS.has(tld)) {
    return false;
  }
  return labels.every((label) => HOST_LABEL.test(label));
}

function firstLabel(query: string): string {
  const hostPort = query.split(/[/?#]/)[0] ?? query;
  return (hostPort.split(":")[0] ?? hostPort).toLowerCase();
}

/** http(s) URL for a typed address, or null when this is a search query. */
export function parseNavigationUrl(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed || trimmed.startsWith("?")) {
    return null;
  }
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const scheme = hasScheme
    ? ""
    : isLocalHost(firstLabel(trimmed)) || isIpv4(firstLabel(trimmed))
      ? "http://"
      : "https://";
  try {
    const url = new URL(`${scheme}${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // A typed http(s) address is opened as-is; a bare word needs a real host.
    if (!hasScheme && !isSiteHost(url.hostname)) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Where Shift+Enter should go: a site when the query looks like one, otherwise
 * the selected engine. A leading `?` always searches, so `?youtube.com` can
 * still be looked up.
 */
export function openFromQuery(engineId: string | undefined, query: string): string | undefined {
  const trimmed = query.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("?")) {
    return webSearchUrl(engineId, trimmed.slice(1));
  }
  return parseNavigationUrl(trimmed) ?? webSearchUrl(engineId, trimmed);
}
