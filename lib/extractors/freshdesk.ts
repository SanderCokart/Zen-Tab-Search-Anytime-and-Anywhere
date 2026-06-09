import { SOURCE_IDS } from "../constants";
import { dedupeByContainment, extractBody, findConversationRoot, sleep } from "../dom-utils";
import type { CollectOptions, CollectResult, MessageExtractor } from "../types";

const CONTAINER_SELECTORS = [
  ".ticket-details-wrapper",
  ".tickets-conversation-pane",
  '[class*="conversation-pane"]',
];

function findMessageElements(root: Element): Element[] {
  const items = [...root.querySelectorAll(".ticket-details__item")].filter(
    (el) =>
      el.querySelector('[data-test-id^="conversation-"]') ||
      el.querySelector('[data-test-conversation="conversation-text"]') ||
      el.querySelector('[data-test-id="conversation-content"]'),
  );

  if (items.length > 0) {
    return dedupeByContainment(items);
  }

  const wrappers = [...root.querySelectorAll('[data-test-id="conversation-wrapper"]')];
  if (wrappers.length > 0) {
    return dedupeByContainment(wrappers);
  }

  return [];
}

function directTextBefore(parent: Element | null, stopBefore: ChildNode | null): string {
  if (!parent) return "";
  let text = "";
  for (const node of parent.childNodes) {
    if (node === stopBefore) break;
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) {
      text += node.textContent;
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

function inferMessageType(el: Element): string {
  const className = el.className?.toString?.() || "";
  if (className.includes("privatenote")) return "private_note";
  if (className.includes("requestor")) return "customer";
  if (el.querySelector("[data-test-is-agent]")) return "agent";
  return "unknown";
}

function parseRecipients(el: Element) {
  const read = (wrapperId: string) => {
    const wrapper = el.querySelector(`[data-test-id="${wrapperId}"]`);
    const emails = wrapper?.querySelector('[data-test-id="display-emails"]');
    return emails?.textContent?.replace(/\s+/g, " ").trim() || "";
  };

  return {
    to: read("to-emails") || read("notified-to-emails"),
    cc: read("cc-emails"),
    bcc: read("bcc-emails"),
  };
}

function statusToChannel(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("e-mail") || lower.includes("email")) return "email";
  if (lower.includes("privénotitie") || lower.includes("private note")) {
    return "private_note";
  }
  if (lower.includes("geantwoord") || lower.includes("replied")) return "reply";
  if (lower.includes("toegevoegd") || lower.includes("added")) return "note";
  return status || "";
}

export function parseMessageElement(el: Element, index: number) {
  const authorEl = el.querySelector('[data-test-id="user-name"]');
  const author =
    authorEl?.querySelector("b")?.textContent?.trim() ||
    authorEl?.textContent?.replace(/\s+/g, " ").trim() ||
    "";

  const status =
    el.querySelector('[data-test-id="conversation-status"]')?.textContent?.trim() || "";

  const timeAgoEl = el.querySelector('[data-test-id="time-ago"]');
  const timeUnitsEl = timeAgoEl?.querySelector(".timeago-units");
  const relativeTime = directTextBefore(timeAgoEl, timeUnitsEl);
  const absoluteTime =
    el.querySelector('[data-test-id="time-info"]')?.getAttribute("aria-label")?.trim() ||
    timeUnitsEl?.textContent?.replace(/^\(|\)$/g, "").trim() ||
    "";

  const headerEl = el.querySelector('[data-test-id^="conversation-"]');
  const conversationId =
    headerEl?.getAttribute("data-test-id")?.replace(/^conversation-/, "") || "";

  const noteEl =
    el.querySelector("[data-note-id]") ||
    el.querySelector('[data-test-conversation="conversation-text"] .ticket_note');
  const noteId = noteEl?.getAttribute("data-note-id") || "";

  const recipients = parseRecipients(el);
  const messageType = inferMessageType(el);
  const isAgent = Boolean(el.querySelector("[data-test-is-agent]"));

  const bodyRoot =
    el.querySelector('[data-test-conversation="conversation-text"]') ||
    el.querySelector('[data-test-id="conversation-content"] .ticket_note') ||
    el.querySelector(".ticket_note");

  const body = extractBody(bodyRoot, {
    includeQuoted: true,
    includeSignature: false,
  });

  return {
    index,
    conversationId,
    noteId,
    messageType,
    isAgent,
    author,
    status,
    channel: statusToChannel(status),
    relativeTime,
    absoluteTime,
    to: recipients.to,
    cc: recipients.cc,
    bcc: recipients.bcc,
    body,
  };
}

async function scrollConversationPane(): Promise<void> {
  const scrollEl =
    document.querySelector(".tickets-conversation-pane") ||
    document.querySelector('[class*="conversation-pane"][class*="overflow"]') ||
    document.querySelector(".ticket-details-wrapper");

  if (!scrollEl) return;

  const step = Math.max(400, scrollEl.clientHeight);
  let lastTop = -1;

  for (let i = 0; i < 80; i++) {
    scrollEl.scrollTop = Math.min(scrollEl.scrollTop + step, scrollEl.scrollHeight);
    await sleep(120);
    if (scrollEl.scrollTop === lastTop) break;
    lastTop = scrollEl.scrollTop;
    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2) {
      break;
    }
  }

  scrollEl.scrollTop = 0;
  await sleep(200);
  for (let i = 0; i < 40; i++) {
    scrollEl.scrollTop = Math.min(scrollEl.scrollTop + step, scrollEl.scrollHeight);
    await sleep(80);
  }
}

async function collectMessages(options: CollectOptions = {}): Promise<CollectResult> {
  if (options.scrollToLoad) {
    await scrollConversationPane();
  }

  const root = findConversationRoot(CONTAINER_SELECTORS);
  if (!root) {
    return {
      ok: false,
      source: SOURCE_IDS.FRESHDESK,
      error:
        "Conversation container not found. Open a ticket detail page with the conversation visible.",
      messages: [],
      pageUrl: location.href,
      collectedAt: new Date().toISOString(),
    };
  }

  const elements = findMessageElements(root);
  const messages = elements.map((el, i) => {
    const parsed = parseMessageElement(el, i + 1);
    if (options.includeHtml) {
      (parsed as Record<string, unknown>).html = el.innerHTML;
    }
    return parsed;
  });

  return {
    ok: true,
    source: SOURCE_IDS.FRESHDESK,
    messageCount: messages.length,
    containerSelector: ".ticket-details-wrapper",
    messages,
    pageUrl: location.href,
    collectedAt: new Date().toISOString(),
  };
}

export const freshdeskExtractor: MessageExtractor = {
  id: SOURCE_IDS.FRESHDESK,
  label: "Freshdesk",
  canHandle() {
    const host = location.hostname;
    return (
      host.endsWith(".freshdesk.com") ||
      host.endsWith(".freshworks.com") ||
      host.endsWith(".myfreshworks.com")
    );
  },
  collectMessages,
};
