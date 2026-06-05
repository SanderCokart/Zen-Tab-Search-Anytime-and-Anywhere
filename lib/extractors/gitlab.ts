import { SOURCE_IDS } from "../constants";
import { extractBody, sleep } from "../dom-utils";
import type {
  CollectOptions,
  CollectResult,
  GitLabPageContext,
  MessageExtractor,
} from "../types";

const CONTAINER_SELECTORS = [
  "#notes-list",
  ".issuable-discussion",
  "#notes",
  ".merge-request-overview",
  "main#content-body",
];

const GITLAB_BODY_STRIP_SELECTORS =
  ".note-actions, .note-form, .note-awards, .awards, .edited-text, .note-edit-form, .gl-dropdown, .design-note-pin";

export function isGitLabDiscussionPage(): boolean {
  const path = location.pathname;
  return (
    /\/-\/(merge_requests|issues|commit)\//.test(path) ||
    /\/(merge_requests|issues)\/\d+/.test(path)
  );
}

function findGitLabConversationRoot(): Element | null {
  for (const selector of CONTAINER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      return el.closest("main, .merge-request-details, .issuable-details") || el;
    }
  }
  return null;
}

export function isSonarQubeNote(el: Element): boolean {
  const authorEl = el.querySelector(
    '.author-name-link, a[data-testid="author-link"], .note-header-author a',
  );
  const authorText = authorEl?.textContent?.toLowerCase() || "";
  if (authorText.includes("sonarqube") || authorText.includes("sonar qube")) {
    return true;
  }
  return Boolean(el.querySelector(".sonarqube-report, [data-testid='sonarqube-note']"));
}

function isConversationNote(el: Element): boolean {
  if (el.classList.contains("draft-note")) return false;
  if (el.classList.contains("system-note")) return false;
  if (isSonarQubeNote(el)) return false;
  return true;
}

export function findNoteElements(root: Element): Element[] {
  const notes = [...root.querySelectorAll('li[id^="note_"]')].filter((el) => {
    if (!isConversationNote(el)) return false;
    return Boolean(el.querySelector(".timeline-content, .note-body, .note-text"));
  });

  const seen = new Set<string>();
  return notes.filter((el) => {
    if (!el.id || seen.has(el.id)) return false;
    seen.add(el.id);
    return true;
  });
}

function extractGitLabBody(bodyRoot: Element | null): string {
  return extractBody(bodyRoot, { stripSelectors: GITLAB_BODY_STRIP_SELECTORS });
}

function inferMessageType(el: Element): string {
  if (el.classList.contains("system-note")) return "system";
  if (el.closest(".diff-file, .diff-content, .discussion-wrapper")) return "diff_note";
  if (el.closest("li.discussion, .discussion-holder")) return "discussion";
  return "note";
}

function parseAuthor(timelineContent: Element) {
  const authorEl =
    timelineContent.querySelector(
      '.author-name-link, a[data-testid="author-link"], .note-header-author a',
    ) || timelineContent.querySelector(".note-header a[href*='/']");

  const author = authorEl?.textContent?.replace(/\s+/g, " ").trim() || "";

  const usernameEl = timelineContent.querySelector(".author-username");
  const usernameFromEl = usernameEl?.textContent?.replace(/^@/, "").trim() || "";
  const usernameFromHref =
    authorEl?.getAttribute("href")?.match(/\/([^/]+)\/?$/)?.[1] || "";

  return {
    author,
    username: usernameFromEl || usernameFromHref,
  };
}

function parseTime(timelineContent: Element) {
  const timeEl =
    timelineContent.querySelector('time[datetime], time, [data-testid="note-time"]') ||
    timelineContent.querySelector(".note-headline-light time");

  return {
    relativeTime: timeEl?.textContent?.replace(/\s+/g, " ").trim() || "",
    absoluteTime: timeEl?.getAttribute("datetime") || timeEl?.getAttribute("title") || "",
  };
}

function parseRole(timelineContent: Element): string {
  const badges = [
    ...timelineContent.querySelectorAll(
      ".note-header .badge, .note-header-info .badge, .timeline-content .badge",
    ),
  ]
    .map((badge) => badge.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean);

  return [...new Set(badges)].join(", ");
}

function parseActionText(timelineContent: Element): string {
  const actionEl = timelineContent.querySelector(".note-headline-light, .system-note-message");
  if (!actionEl) return "";

  const clone = actionEl.cloneNode(true) as Element;
  clone
    .querySelectorAll("time, .badge, .author-name-link, .author-username")
    .forEach((node) => node.remove());

  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

function parseDiffContext(el: Element) {
  const diffFile = el.closest(".diff-file, .file-holder, .diff-content");
  if (!diffFile) {
    return { fileName: "", line: "" };
  }

  const fileName =
    diffFile
      .querySelector('.file-title-name, [data-testid="file-name"], a[data-testid="file-title"]')
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || "";

  const line =
    diffFile
      .querySelector(".line-numbers, .diff-line-num, [data-linenumber]")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || "";

  return { fileName, line };
}

export function parseNoteElement(el: Element, index: number) {
  const noteId = el.id.replace(/^note_/, "");
  const timelineContent =
    el.querySelector(":scope > .timeline-entry-inner > .timeline-content") ||
    el.querySelector(".timeline-content") ||
    el;

  const { author, username } = parseAuthor(timelineContent);
  const { relativeTime, absoluteTime } = parseTime(timelineContent);
  const role = parseRole(timelineContent);
  const actionText = parseActionText(timelineContent);
  const messageType = inferMessageType(el);
  const { fileName, line } = parseDiffContext(el);

  const bodyRoot =
    timelineContent.querySelector(
      '.note-text, [data-testid="note-body"], .note-body, .system-note-content',
    ) || timelineContent.querySelector(".md");

  const discussionEl = el.closest("[data-discussion-id], li.discussion");
  const discussionId = discussionEl?.getAttribute("data-discussion-id") || "";

  return {
    index,
    noteId,
    discussionId,
    messageType,
    author,
    username,
    role,
    actionText,
    relativeTime,
    absoluteTime,
    fileName,
    line,
    body: extractGitLabBody(bodyRoot),
    className: el.className?.toString?.() || "",
  };
}

async function scrollDiscussionPane(root: Element): Promise<void> {
  const scrollTargets = [
    root,
    document.querySelector("#notes-list"),
    document.querySelector(".merge-request-details"),
    document.querySelector(".content-wrapper"),
    document.documentElement,
  ].filter(Boolean) as Element[];

  for (const scrollEl of scrollTargets) {
    const maxScroll = scrollEl.scrollHeight - (scrollEl.clientHeight || window.innerHeight);
    if (maxScroll <= 0) continue;

    let lastTop = -1;
    for (let i = 0; i < 60; i++) {
      const step = Math.max(400, scrollEl.clientHeight || window.innerHeight);
      scrollEl.scrollTop = Math.min(scrollEl.scrollTop + step, scrollEl.scrollHeight);
      await sleep(100);
      if (scrollEl.scrollTop === lastTop) break;
      lastTop = scrollEl.scrollTop;
    }
  }
}

function getPageContext(): GitLabPageContext {
  const path = location.pathname;
  const mergeRequest = path.match(/\/-\/merge_requests\/(\d+)/);
  const issue = path.match(/\/-\/issues\/(\d+)/);
  const project = path.match(/^(.*?)\/-\/(merge_requests|issues|commit)\//)?.[1] || "";

  return {
    projectPath: decodeURIComponent(project.replace(/^\//, "")),
    mergeRequestIid: mergeRequest?.[1] || "",
    issueIid: issue?.[1] || "",
    pageType: mergeRequest ? "merge_request" : issue ? "issue" : "discussion",
  };
}

async function collectMessages(options: CollectOptions = {}): Promise<CollectResult> {
  if (!isGitLabDiscussionPage()) {
    return {
      ok: false,
      source: SOURCE_IDS.GITLAB,
      error: "Open a GitLab merge request, issue, or commit discussion page first.",
      messages: [],
      pageUrl: location.href,
      collectedAt: new Date().toISOString(),
    };
  }

  if (options.scrollToLoad) {
    const root = findGitLabConversationRoot() || document.body;
    await scrollDiscussionPane(root);
  }

  const root = findGitLabConversationRoot();
  if (!root) {
    return {
      ok: false,
      source: SOURCE_IDS.GITLAB,
      error:
        "Discussion container not found. Open the merge request or issue discussion tab.",
      messages: [],
      pageUrl: location.href,
      collectedAt: new Date().toISOString(),
    };
  }

  const elements = findNoteElements(root);
  const messages = elements.map((el, i) => {
    const parsed = parseNoteElement(el, i + 1);
    if (options.includeHtml) {
      (parsed as Record<string, unknown>).html =
        el.querySelector(".timeline-content")?.innerHTML || el.innerHTML;
    }
    return parsed;
  });

  return {
    ok: true,
    source: SOURCE_IDS.GITLAB,
    messageCount: messages.length,
    containerSelector: root.id ? `#${root.id}` : ".issuable-discussion",
    pageContext: getPageContext(),
    messages,
    pageUrl: location.href,
    collectedAt: new Date().toISOString(),
  };
}

export const gitlabExtractor: MessageExtractor = {
  id: SOURCE_IDS.GITLAB,
  label: "GitLab",
  canHandle() {
    const host = location.hostname;
    const hostMatches =
      host === "gitlab.com" ||
      host.endsWith(".gitlab.com") ||
      host.startsWith("gitlab.") ||
      host.includes("gitlab");
    return hostMatches || isGitLabDiscussionPage();
  },
  collectMessages,
};
