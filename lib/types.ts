import type { SourceId } from "./constants";

export interface CollectOptions {
  scrollToLoad?: boolean;
  includeHtml?: boolean;
}

export interface CollectResult {
  ok: boolean;
  source?: SourceId;
  error?: string;
  messageCount?: number;
  containerSelector?: string;
  pageContext?: GitLabPageContext;
  messages: Record<string, unknown>[];
  pageUrl: string;
  collectedAt: string;
}

export interface GitLabPageContext {
  projectPath: string;
  mergeRequestIid: string;
  issueIid: string;
  pageType: "merge_request" | "issue" | "discussion";
}

export interface MessageExtractor {
  readonly id: SourceId;
  readonly label: string;
  canHandle(): boolean;
  collectMessages(options: CollectOptions): Promise<CollectResult>;
}
