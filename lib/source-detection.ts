import { SOURCE_IDS, type SourceId } from "./constants";

export function detectSourceFromUrl(url: string): SourceId | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    if (
      host.endsWith(".freshdesk.com") ||
      host.endsWith(".freshworks.com") ||
      host.endsWith(".myfreshworks.com")
    ) {
      return SOURCE_IDS.FRESHDESK;
    }

    if (
      host === "gitlab.com" ||
      host.endsWith(".gitlab.com") ||
      host.startsWith("gitlab.") ||
      host.includes("gitlab") ||
      /\/-\/(merge_requests|issues|commit)\//.test(parsed.pathname)
    ) {
      return SOURCE_IDS.GITLAB;
    }
  } catch {
    return null;
  }

  return null;
}

export function sourceLabel(source: SourceId | null): string {
  if (source === SOURCE_IDS.FRESHDESK) return "Freshdesk ticket";
  if (source === SOURCE_IDS.GITLAB) return "GitLab discussion";
  return "this page";
}
