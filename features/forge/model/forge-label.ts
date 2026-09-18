export type ForgePlatform = "gitlab" | "github";
export type ForgeKind = "issue" | "merge_request" | "pull_request";

export interface ForgeRef {
  platform: ForgePlatform;
  kind: ForgeKind;
  id: string;
  host: string;
  projectPath: string;
  url: string;
}

export interface ForgePageInfo {
  title?: string;
  bodyText?: string;
}

const CLOSES_PATTERN =
  /\b(?:closes?|closed|closing|fixes?|fixed|fixing|resolves?|resolved|resolving)\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/gi;
const MENTIONS_PATTERN = /\b(?:related(?:\s+to)?|mentions?)\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/gi;
const ISSUE_URL_PATTERN = /\/(?:-\/)?issues\/(\d+)/gi;
const HASH_ISSUE_PATTERN = /(?<![A-Za-z0-9/])#(\d+)\b/g;

export function detectForgePlatform(urlString: string): ForgePlatform | null {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host.includes("github")) {
      return "github";
    }
    if (host.includes("gitlab")) {
      return "gitlab";
    }
  } catch {
    return null;
  }

  return null;
}

export function parseForgeUrl(urlString: string): ForgeRef | null {
  const platform = detectForgePlatform(urlString);
  if (!platform) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return null;
  }
  const pathname = parsedUrl.pathname;
  const normalizedPathname = pathname.replace(/^\/+|\/+$/g, "");

  if (platform === "gitlab") {
    const issue = pathname.match(/\/(?:-\/)?(?:issues|work_items)\/(\d+)/);
    if (issue?.[1]) {
      return {
        platform,
        kind: "issue",
        id: issue[1],
        host: parsedUrl.hostname,
        projectPath: normalizedPathname.split(/\/(?:-\/)?(?:issues|work_items)\//)[0] || "",
        url: parsedUrl.href,
      };
    }

    const mergeRequest = pathname.match(/\/(?:-\/)?merge_requests\/(\d+)/);
    if (mergeRequest?.[1]) {
      return {
        platform,
        kind: "merge_request",
        id: mergeRequest[1],
        host: parsedUrl.hostname,
        projectPath: normalizedPathname.split(/\/(?:-\/)?merge_requests\//)[0] || "",
        url: parsedUrl.href,
      };
    }

    return null;
  }

  const issue = pathname.match(/\/issues\/(\d+)/);
  if (issue?.[1]) {
    return {
      platform,
      kind: "issue",
      id: issue[1],
      host: parsedUrl.hostname,
      projectPath: normalizedPathname.split("/issues/")[0] || "",
      url: parsedUrl.href,
    };
  }

  const pullRequest = pathname.match(/\/pull\/(\d+)/);
  if (pullRequest?.[1]) {
    return {
      platform,
      kind: "pull_request",
      id: pullRequest[1],
      host: parsedUrl.hostname,
      projectPath: normalizedPathname.split("/pull/")[0] || "",
      url: parsedUrl.href,
    };
  }

  return null;
}

export function extractRelatedIssueId(text: string, selfId?: string): string | undefined {
  if (!text) {
    return undefined;
  }

  for (const pattern of [CLOSES_PATTERN, MENTIONS_PATTERN, ISSUE_URL_PATTERN, HASH_ISSUE_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const id = match[1];
      if (id && id !== selfId) {
        return id;
      }
    }
  }

  return undefined;
}

export function forgeTitleIncludesRefId(title: string, id: string): boolean {
  if (!title || !id) {
    return false;
  }

  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\dA-Za-z])(?:#|!)?${escapedId}(?!\\d)`).test(title);
}

export function cleanForgeTitle(title: string, ref: ForgeRef): string {
  let cleaned = title.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\s*[·|].*$/, "");
  cleaned = cleaned.replace(new RegExp(`\\s*[\\[(][!#]?${ref.id}[\\])]\\s*$`), "");
  cleaned = cleaned.replace(/\s*\((?:#|!)\d+\)\s*$/, "");
  return cleaned.trim();
}

export function formatForgeLabel(ref: ForgeRef, title: string, relatedIssueId?: string): string {
  const suffix = title ? ` - ${title}` : "";

  if (ref.kind === "issue") {
    return `ISSUE: #${ref.id}${suffix}`;
  }

  const prefix = ref.platform === "github" ? "PR" : "MR";
  if (relatedIssueId) {
    return `${prefix}: #${relatedIssueId} - !${ref.id}${suffix}`;
  }

  return `${prefix}: !${ref.id}${suffix}`;
}

export function buildForgeLabel(url: string, tabTitle = "", page?: ForgePageInfo): string | null {
  const ref = parseForgeUrl(url);
  if (!ref) {
    return null;
  }

  const title = cleanForgeTitle(page?.title || tabTitle, ref);
  const relatedIssueId =
    ref.kind === "issue" ? undefined : extractRelatedIssueId(page?.bodyText || "", ref.id);

  return formatForgeLabel(ref, title, relatedIssueId);
}
