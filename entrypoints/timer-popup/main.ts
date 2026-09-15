import { debugError } from "../../lib/debug";
import {
  formatTimerCountdown,
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  stripTimerPrefix,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "../../lib/timer";
import type { TabInfo, TabTimer } from "../../lib/types";
import { formatTabDisplayTitle } from "../../lib/types";

const tabId = Number(new URLSearchParams(window.location.search).get("tabId"));
const titleEl = document.getElementById("tab-title") as HTMLHeadingElement;
const metaEl = document.getElementById("tab-meta") as HTMLParagraphElement;
const statusEl = document.getElementById("timer-status") as HTMLParagraphElement;
const presetsEl = document.getElementById("presets") as HTMLDivElement;
const form = document.getElementById("timer-form") as HTMLFormElement;
const endsAt = document.getElementById("ends-at") as HTMLInputElement;
const previewEl = document.getElementById("preview") as HTMLParagraphElement;
const clearButton = document.getElementById("clear-timer") as HTMLButtonElement;
const errorEl = document.getElementById("error") as HTMLParagraphElement;

let tab: TabInfo | undefined;
let timer: TabTimer | undefined;

function showError(message: string): void {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError(): void {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function hostname(url: string): string {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}

function selectedEndAt(): number {
  return fromDatetimeLocalValue(endsAt.value);
}

function syncPickerBounds(now = Date.now()): void {
  endsAt.min = toDatetimeLocalValue(now + 60_000);
  endsAt.max = toDatetimeLocalValue(now + MAX_TIMER_MS);
}

function updatePreview(): void {
  const endAt = selectedEndAt();
  if (!Number.isFinite(endAt)) {
    previewEl.textContent = "Pick a time to count down to.";
    return;
  }
  if (!isAllowedTimerEnd(endAt)) {
    previewEl.textContent = "Choose a time between 1 minute and 31 days from now.";
    return;
  }
  previewEl.textContent = formatTimerCountdown(endAt);
}

function render(): void {
  if (!tab) {
    return;
  }

  titleEl.textContent = formatTabDisplayTitle({
    ...tab,
    customLabel: stripTimerPrefix(tab.customLabel || ""),
  });
  metaEl.textContent = tab.workspaceName || hostname(tab.url) || tab.url || "No URL";

  if (timer) {
    statusEl.hidden = false;
    statusEl.textContent = `Current timer ${formatTimerCountdown(timer.endAt)}`;
    clearButton.hidden = false;
  } else {
    statusEl.hidden = true;
    clearButton.hidden = true;
  }

  updatePreview();
}

function applyEndAt(endAt: number): void {
  endsAt.value = toDatetimeLocalValue(endAt);
  updatePreview();
}

function submitTimer(endAt: number): void {
  clearError();
  if (!isAllowedTimerEnd(endAt)) {
    showError("Choose a time between 1 minute and 31 days from now.");
    endsAt.focus();
    return;
  }

  void browser.runtime
    .sendMessage({ type: "setTimer", tabId, endAt })
    .then((response: { error?: string }) => {
      if (response?.error) {
        showError(response.error);
        return;
      }
      window.close();
    })
    .catch((error) => {
      debugError("Could not set custom timer:", error);
      showError("Could not set the timer.");
    });
}

async function load(): Promise<void> {
  if (!Number.isInteger(tabId) || tabId < 0) {
    titleEl.textContent = "No tab selected";
    showError("Open this window from a tab to set a timer.");
    form.querySelectorAll("input, button").forEach((el) => {
      (el as HTMLButtonElement).disabled = true;
    });
    return;
  }

  const [tabResponse, timersResponse] = await Promise.all([
    browser.runtime.sendMessage({ type: "getTab", tabId }),
    browser.runtime.sendMessage({ type: "getTimers" }),
  ]);

  if (tabResponse && typeof tabResponse === "object" && "error" in tabResponse) {
    throw new Error(String((tabResponse as { error: string }).error));
  }

  tab = tabResponse as TabInfo;
  if (Array.isArray(timersResponse)) {
    timer = (timersResponse as TabTimer[]).find((item) => item.tabId === tabId);
  }

  syncPickerBounds();
  applyEndAt(timer?.endAt ?? Date.now() + 30 * 60_000);
  render();
  endsAt.focus();
}

for (const preset of TIMER_PRESETS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zen-timer-preset";
  button.textContent = preset.label;
  button.addEventListener("click", () => {
    clearError();
    applyEndAt(preset.endAt(new Date()));
  });
  presetsEl.appendChild(button);
}

endsAt.addEventListener("input", () => {
  clearError();
  updatePreview();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitTimer(selectedEndAt());
});

clearButton.addEventListener("click", () => {
  clearError();
  void browser.runtime
    .sendMessage({ type: "clearTimer", tabId })
    .then((response: { error?: string }) => {
      if (response?.error) {
        showError(response.error);
        return;
      }
      timer = undefined;
      applyEndAt(Date.now() + 30 * 60_000);
      render();
    })
    .catch((error) => {
      debugError("Could not clear custom timer:", error);
      showError("Could not clear the timer.");
    });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    window.close();
  }
});

setInterval(() => {
  syncPickerBounds();
  render();
}, 1000);

void load().catch((error) => {
  debugError("Could not load custom timer popup:", error);
  titleEl.textContent = "Unable to load tab";
  showError("Make sure the extension is enabled in Zen Browser.");
});
