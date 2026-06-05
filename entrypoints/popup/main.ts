import { MESSAGE_TYPES } from "../../lib/constants";
import type { SourceId } from "../../lib/constants";
import { detectSourceFromUrl, sourceLabel } from "../../lib/source-detection";
import type { CollectResult } from "../../lib/types";
import "./style.css";

const collectBtn = document.getElementById("collect") as HTMLButtonElement;
const scrollCheckbox = document.getElementById("scrollToLoad") as HTMLInputElement;
const includeHtmlCheckbox = document.getElementById("includeHtml") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const actionsEl = document.getElementById("actions") as HTMLDivElement;
const previewEl = document.getElementById("preview") as HTMLPreElement;
const copyBtn = document.getElementById("copyJson") as HTMLButtonElement;
const downloadBtn = document.getElementById("downloadJson") as HTMLButtonElement;
const pageContextEl = document.getElementById("pageContext") as HTMLParagraphElement;

let lastResult: CollectResult | null = null;
let detectedSource: SourceId | null = null;

function setStatus(text: string, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function updatePageContext(tab: Browser.tabs.Tab | undefined) {
  detectedSource = tab?.url ? detectSourceFromUrl(tab.url) : null;

  if (!tab?.url) {
    pageContextEl.textContent = "No active tab detected.";
    collectBtn.disabled = true;
    return;
  }

  if (detectedSource === "freshdesk") {
    pageContextEl.textContent =
      "Freshdesk ticket detected. Collect the conversation from the open tab.";
    collectBtn.disabled = false;
    scrollCheckbox.disabled = false;
    return;
  }

  if (detectedSource === "gitlab") {
    pageContextEl.textContent =
      "GitLab discussion detected. Collect merge request or issue comments from the open tab.";
    collectBtn.disabled = false;
    scrollCheckbox.disabled = false;
    return;
  }

  pageContextEl.textContent =
    "Open a Freshdesk ticket or GitLab discussion page to collect messages.";
  collectBtn.disabled = true;
  scrollCheckbox.disabled = false;
}

document.querySelectorAll(".tab").forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    const tabName = (tabButton as HTMLButtonElement).dataset.tab;

    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button === tabButton);
    });

    document.querySelectorAll(".panel").forEach((panel) => {
      const isActive = panel.id === `panel-${tabName}`;
      panel.classList.toggle("active", isActive);
      (panel as HTMLElement).hidden = !isActive;
    });
  });
});

collectBtn.addEventListener("click", async () => {
  setStatus("Collecting...");
  actionsEl.classList.add("hidden");
  previewEl.classList.add("hidden");
  lastResult = null;

  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("No active tab.", "error");
    return;
  }

  try {
    const result = (await browser.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.COLLECT_MESSAGES,
      source: detectedSource,
      scrollToLoad: scrollCheckbox.checked,
      includeHtml: includeHtmlCheckbox.checked,
    })) as CollectResult;

    lastResult = result;

    if (!result?.ok) {
      setStatus(result?.error || "Collection failed.", "error");
      return;
    }

    setStatus(`Found ${result.messageCount} message(s).`, "ok");
    actionsEl.classList.remove("hidden");

    const preview = result.messages
      .slice(0, 3)
      .map((m) => {
        const meta = [m.status || m.role, m.relativeTime || m.absoluteTime]
          .filter(Boolean)
          .join(" · ");
        const label = m.username
          ? `${m.author || "?"} @${m.username}`
          : (m.author as string) || "?";
        return `#${m.index} ${label} (${m.messageType})${meta ? `\n${meta}` : ""}\n${String(m.body || "").slice(0, 120)}`;
      })
      .join("\n\n");
    previewEl.textContent = result.messages.length > 3 ? `${preview}\n\n...` : preview;
    previewEl.classList.remove("hidden");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Could not establish connection")) {
      setStatus(
        `Content script not loaded on ${sourceLabel(detectedSource)}. Reload the extension in about:debugging, then reload this tab.`,
        "error",
      );
    } else {
      setStatus(msg, "error");
    }
  }
});

copyBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  const json = JSON.stringify(lastResult, null, 2);
  await navigator.clipboard.writeText(json);
  setStatus("Copied JSON to clipboard.", "ok");
});

downloadBtn.addEventListener("click", () => {
  if (!lastResult) return;
  const json = JSON.stringify(lastResult, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  let name = "messages.json";
  if (lastResult.source === "freshdesk") {
    const ticketId = (lastResult.pageUrl || "").match(/\/tickets\/(\d+)/);
    name = ticketId ? `freshdesk-ticket-${ticketId[1]}-messages.json` : "freshdesk-messages.json";
  } else if (lastResult.source === "gitlab") {
    const mrId = lastResult.pageContext?.mergeRequestIid;
    const issueId = lastResult.pageContext?.issueIid;
    if (mrId) {
      name = `gitlab-mr-${mrId}-messages.json`;
    } else if (issueId) {
      name = `gitlab-issue-${issueId}-messages.json`;
    } else {
      name = "gitlab-discussion-messages.json";
    }
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded ${name}.`, "ok");
});

getActiveTab().then(updatePageContext);
