export interface ReusableTab {
  id: number | null;
  domId?: string;
  url: string;
  lastOpenedAt?: number;
}

const TRACKING_PARAMS = new Set([
  "fbclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

function readHttpTarget(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const candidates = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) {
      candidates.push(decoded);
    }
  } catch {
    // The parameter was not percent-encoded.
  }

  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function unwrapMailRedirect(raw: string, depth = 0): string {
  if (depth >= 3) {
    return raw;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const host = url.hostname.toLowerCase();
  let target: string | null = null;
  if (
    host === "safelinks.protection.outlook.com" ||
    host.endsWith(".safelinks.protection.outlook.com")
  ) {
    target = readHttpTarget(url.searchParams.get("url"));
  } else if ((host === "google.com" || host === "www.google.com") && url.pathname === "/url") {
    target = readHttpTarget(url.searchParams.get("q") ?? url.searchParams.get("url"));
  }

  if (!target) {
    return raw;
  }

  return unwrapMailRedirect(target, depth + 1);
}

export function normalizeComparableUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(unwrapMailRedirect(raw.trim()));
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  url.search = "";
  for (const [key, value] of kept) {
    url.searchParams.append(key, value);
  }

  return url.href;
}

function canFocus(tab: ReusableTab): boolean {
  return (
    (typeof tab.id === "number" && Number.isInteger(tab.id) && tab.id >= 0) ||
    (typeof tab.domId === "string" && tab.domId.length > 0)
  );
}

export function findReusableTab(
  tabs: readonly ReusableTab[],
  openedTabId: number,
  targetUrl: string,
): ReusableTab | undefined {
  const target = normalizeComparableUrl(targetUrl);
  if (!target) {
    return undefined;
  }

  let best: ReusableTab | undefined;
  for (const tab of tabs) {
    if (tab.id === openedTabId || !canFocus(tab)) {
      continue;
    }
    if (normalizeComparableUrl(tab.url) !== target) {
      continue;
    }
    if (!best || (tab.lastOpenedAt ?? 0) > (best.lastOpenedAt ?? 0)) {
      best = tab;
    }
  }

  return best;
}
