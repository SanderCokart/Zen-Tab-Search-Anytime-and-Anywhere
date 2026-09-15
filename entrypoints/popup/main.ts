import { debugError, debugLog } from "../../lib/debug";
import type { SearchItem, SpaceInfo, TabInfo, TabTimer } from "../../lib/types";
import { formatSpaceDisplayTitle, formatTabDisplayTitle, isActivatableTab } from "../../lib/types";
import { buildSearchItems, filterSearchItems, prioritizeCurrentTab } from "../../lib/search";
import {
  formatTimerClock,
  formatTimerCountdown,
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  stripTimerPrefix,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "../../lib/timer";

const input = document.getElementById("search-input") as HTMLInputElement;
const list = document.getElementById("results") as HTMLUListElement;
const emptyEl = document.getElementById("empty") as HTMLDivElement;
let allTabs: TabInfo[] = [];
let allSpaces: SpaceInfo[] = [];
let visibleItems: SearchItem[] = [];
let selectedIndex = -1;
let timers = new Map<number, TabTimer>();
const openTimerTabs = new Set<number>();
const timerDrafts = new Map<number, number>();

function currentTabId(): number | undefined {
  const active = allTabs.find((tab) => tab.active && Number.isInteger(tab.id) && tab.id! >= 0);
  return active?.id ?? undefined;
}

function visibleSearchItems(query: string): SearchItem[] {
  const items = filterSearchItems(buildSearchItems(allTabs, allSpaces), query);
  return query.trim() ? items : prioritizeCurrentTab(items, currentTabId());
}

function focusSearchInput() {
  input.focus();
  input.select();
}

function isErrorResponse(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

function updateSelection(scrollSelectedIntoView = false) {
  const items = list.querySelectorAll("li");
  items.forEach((item) => item.classList.remove("selected"));
  if (selectedIndex >= 0 && selectedIndex < items.length) {
    const el = items[selectedIndex]!;
    el.classList.add("selected");
    if (scrollSelectedIntoView) {
      el.scrollIntoView({ block: "nearest" });
    }
  }
}

function formatRemaining(endAt: number): string {
  return formatTimerClock(endAt - Date.now());
}

function timerForTab(tab: TabInfo): TabTimer | undefined {
  return Number.isInteger(tab.id) && tab.id! >= 0 ? timers.get(tab.id!) : undefined;
}

function sendTimerMessage(message: object): Promise<{
  error?: string;
  tabId?: number;
  endAt?: number;
  originalLabel?: string;
  title?: string;
}> {
  return browser.runtime.sendMessage(message) as Promise<{
    error?: string;
    tabId?: number;
    endAt?: number;
    originalLabel?: string;
    title?: string;
  }>;
}

function createSvgIcon(...pathData: string[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("zen-timer-icon");
  for (const d of pathData) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function createTimerIcon(): SVGSVGElement {
  const svg = createSvgIcon("M12 9v4l2.5 1.5", "M9 3h6M12 3v2");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "13");
  circle.setAttribute("r", "8");
  svg.insertBefore(circle, svg.firstChild);
  return svg;
}

function createCloseIcon(): SVGSVGElement {
  return createSvgIcon("M6 6l12 12M18 6L6 18");
}

function draftEndAt(tabId: number, timer?: TabTimer): number {
  return timerDrafts.get(tabId) ?? timer?.endAt ?? Date.now() + 30 * 60_000;
}

function applyTimerResponse(tabId: number, response: { error?: string } & Partial<TabTimer>): void {
  if (response?.error) {
    debugError("Could not update timer:", response.error);
    return;
  }
  if (response.tabId !== undefined && response.endAt !== undefined) {
    timers.set(tabId, {
      tabId: response.tabId,
      endAt: response.endAt,
      originalLabel: response.originalLabel ?? "",
      title: response.title ?? "",
    });
  } else {
    timers.delete(tabId);
  }
  openTimerTabs.delete(tabId);
  timerDrafts.delete(tabId);
  renderItems(visibleItems);
}

function renderTimerToggle(container: HTMLElement, tab: TabInfo): void {
  if (!Number.isInteger(tab.id) || tab.id! < 0) {
    return;
  }

  const tabId = tab.id!;
  const timer = timerForTab(tab);
  const open = openTimerTabs.has(tabId);
  const timerEl = document.createElement("div");
  timerEl.className = "zen-timer";
  timerEl.addEventListener("click", (event) => event.stopPropagation());

  if (timer) {
    const countdown = document.createElement("span");
    countdown.className = "zen-timer-countdown";
    countdown.dataset.endAt = String(timer.endAt);
    countdown.textContent = `⏱ ${formatRemaining(timer.endAt)}`;
    timerEl.appendChild(countdown);
  }

  const toggle = document.createElement("button");
  toggle.className = "zen-timer-button zen-timer-icon-button";
  toggle.type = "button";
  if (open) {
    toggle.title = "Close timer settings";
    toggle.setAttribute("aria-label", "Close timer settings");
    toggle.appendChild(createCloseIcon());
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      openTimerTabs.delete(tabId);
      renderItems(visibleItems);
    });
  } else {
    toggle.title = "Set a timer for this tab";
    toggle.setAttribute("aria-label", "Set a timer for this tab");
    toggle.appendChild(createTimerIcon());
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      openTimerTabs.add(tabId);
      if (!timerDrafts.has(tabId)) {
        timerDrafts.set(tabId, draftEndAt(tabId, timer));
      }
      renderItems(visibleItems);
    });
  }
  timerEl.appendChild(toggle);
  container.appendChild(timerEl);
}

function renderTimerPanel(tab: TabInfo): HTMLElement {
  const tabId = tab.id!;
  const timer = timerForTab(tab);
  const panel = document.createElement("div");
  panel.className = "zen-timer-panel";
  panel.addEventListener("click", (event) => event.stopPropagation());

  const endsAt = document.createElement("input");
  endsAt.className = "zen-timer-input";
  endsAt.type = "datetime-local";
  endsAt.step = "60";
  endsAt.title = "Timer end time";
  endsAt.setAttribute("aria-label", "Timer end time");
  const now = Date.now();
  endsAt.min = toDatetimeLocalValue(now + 60_000);
  endsAt.max = toDatetimeLocalValue(now + MAX_TIMER_MS);
  endsAt.value = toDatetimeLocalValue(draftEndAt(tabId, timer));

  const preview = document.createElement("p");
  preview.className = "zen-timer-preview";

  function updatePreview(): void {
    const endAt = fromDatetimeLocalValue(endsAt.value);
    timerDrafts.set(tabId, endAt);
    preview.textContent = isAllowedTimerEnd(endAt)
      ? formatTimerCountdown(endAt)
      : "Choose a time between 1 minute and 31 days from now.";
  }

  const presets = document.createElement("div");
  presets.className = "zen-timer-presets";
  for (const preset of TIMER_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zen-timer-preset";
    button.textContent = preset.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const endAt = preset.endAt(new Date());
      timerDrafts.set(tabId, endAt);
      endsAt.value = toDatetimeLocalValue(endAt);
      updatePreview();
    });
    presets.appendChild(button);
  }
  panel.appendChild(presets);

  endsAt.addEventListener("input", () => {
    updatePreview();
  });
  updatePreview();

  const field = document.createElement("label");
  field.className = "zen-timer-field";
  field.append("Ends at", endsAt);
  panel.appendChild(field);
  panel.appendChild(preview);

  const actions = document.createElement("div");
  actions.className = "zen-timer-actions";

  const set = document.createElement("button");
  set.className = "zen-timer-button";
  set.type = "button";
  set.textContent = "Set timer";
  set.addEventListener("click", (event) => {
    event.stopPropagation();
    const endAt = fromDatetimeLocalValue(endsAt.value);
    if (!isAllowedTimerEnd(endAt)) {
      endsAt.focus();
      updatePreview();
      return;
    }
    void sendTimerMessage({ type: "setTimer", tabId, endAt }).then((response) => {
      applyTimerResponse(tabId, response);
    });
  });
  actions.appendChild(set);

  if (timer) {
    const clear = document.createElement("button");
    clear.className = "zen-timer-button zen-timer-clear";
    clear.type = "button";
    clear.textContent = "Clear";
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      void sendTimerMessage({ type: "clearTimer", tabId }).then((response) => {
        if (response?.error) {
          debugError("Could not clear timer:", response.error);
          return;
        }
        applyTimerResponse(tabId, {});
      });
    });
    actions.appendChild(clear);
  }

  panel.appendChild(actions);
  return panel;
}

function activateItem(item: SearchItem) {
  if (item.kind === "space") {
    browser.runtime
      .sendMessage({ type: "switchSpace", spaceId: item.data.id })
      .then((response: { error?: string }) => {
        if (response?.error) {
          debugError("Error response from switchSpace:", response.error);
          return;
        }
        window.close();
      })
      .catch((error) => {
        debugError("Error sending switchSpace message:", error);
      });
    return;
  }

  if (!isActivatableTab(item.data)) {
    return;
  }

  browser.runtime
    .sendMessage({
      type: "switchTab",
      tabId: item.data.id ?? undefined,
      domId: item.data.domId,
    })
    .then((response: { error?: string }) => {
      if (response?.error) {
        debugError("Error response from switchTab:", response.error);
        return;
      }
      window.close();
    })
    .catch((error) => {
      debugError("Error sending switchTab message:", error);
    });
}

function renderItems(filteredItems: SearchItem[]) {
  list.innerHTML = "";

  if (filteredItems.length === 0) {
    emptyEl.textContent = "No tabs or spaces found.";
    emptyEl.hidden = false;
    selectedIndex = -1;
    return;
  }

  emptyEl.hidden = true;

  filteredItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.kind === "space" ? "zen-tab-item zen-space-item" : "zen-tab-item";
    li.dataset.kind = item.kind;
    li.setAttribute("role", "option");

    if (item.kind === "space") {
      li.dataset.spaceId = item.data.id;

      const icon = document.createElement("span");
      icon.className = "zen-space-icon";
      icon.textContent = item.data.icon?.trim() || "◆";
      li.appendChild(icon);

      const text = document.createElement("div");
      text.className = "zen-text";

      const title = document.createElement("span");
      title.textContent = formatSpaceDisplayTitle(item.data);
      title.className = "zen-title";
      text.appendChild(title);

      const subtitle = document.createElement("span");
      subtitle.textContent = item.data.isActive ? "Current space" : "Space";
      subtitle.className = "zen-url";
      text.appendChild(subtitle);

      li.appendChild(text);
    } else {
      if (Number.isInteger(item.data.id) && item.data.id! >= 0) {
        li.dataset.tabId = String(item.data.id);
      }
      if (item.data.domId) {
        li.dataset.domId = item.data.domId;
      }

      if (item.data.favIconUrl) {
        const img = document.createElement("img");
        img.src = item.data.favIconUrl;
        img.className = "zen-favicon";
        li.appendChild(img);
      }

      const text = document.createElement("div");
      text.className = "zen-text";

      const tabBlock = document.createElement("div");
      tabBlock.className = "zen-tab-timer-block";

      const titleRow = document.createElement("div");
      titleRow.className = "zen-title-row";

      const title = document.createElement("span");
      title.textContent = formatTabDisplayTitle({
        ...item.data,
        customLabel: stripTimerPrefix(item.data.customLabel || ""),
      });
      title.className = "zen-title";
      titleRow.appendChild(title);
      renderTimerToggle(titleRow, item.data);
      tabBlock.appendChild(titleRow);

      if (Number.isInteger(item.data.id) && openTimerTabs.has(item.data.id!)) {
        tabBlock.appendChild(renderTimerPanel(item.data));
      }

      text.appendChild(tabBlock);

      const url = document.createElement("span");
      if (item.data.workspaceName) {
        url.textContent = item.data.workspaceName;
      } else {
        try {
          url.textContent = item.data.url ? new URL(item.data.url).hostname : "No URL";
        } catch {
          url.textContent = "No URL";
        }
      }
      if (item.data.active) {
        url.textContent = url.textContent ? `${url.textContent} · Current tab` : "Current tab";
      }
      url.className = "zen-url";
      text.appendChild(url);

      li.appendChild(text);
    }

    li.addEventListener("click", () => {
      activateItem(item);
    });
    list.appendChild(li);
  });

  selectedIndex = filteredItems.length > 0 ? 0 : -1;
  updateSelection();
}

function refreshFilter() {
  const query = input.value;
  visibleItems = visibleSearchItems(query);
  renderItems(visibleItems);
}

emptyEl.textContent = "Loading tabs and spaces…";
emptyEl.hidden = false;

function applyTabs(tabs: unknown): void {
  if (isErrorResponse(tabs)) {
    throw new Error(tabs.error);
  }
  allTabs = Array.isArray(tabs) ? tabs.filter(isActivatableTab) : [];
}

function applySpaces(spaces: unknown): void {
  if (isErrorResponse(spaces)) {
    throw new Error(spaces.error);
  }
  allSpaces = Array.isArray(spaces) ? spaces : [];
}

// Initial data load — works without an active content tab; background uses Zen experiment fallbacks.
browser.runtime
  .sendMessage({ type: "getTabs" })
  .then((tabs) => {
    applyTabs(tabs);
    visibleItems = visibleSearchItems(input.value);
    renderItems(visibleItems);
  })
  .catch((error) => {
    debugError("Error fetching tabs for popup:", error);
    emptyEl.textContent = "Unable to load tabs. Make sure the extension is enabled in Zen Browser.";
    emptyEl.hidden = false;
  });

browser.runtime
  .sendMessage({ type: "getSpaces" })
  .then((spaces) => {
    applySpaces(spaces);
    visibleItems = visibleSearchItems(input.value);
    renderItems(visibleItems);
  })
  .catch((error) => debugError("Error fetching spaces for popup:", error));

void browser.runtime
  .sendMessage({ type: "getTimers" })
  .then((activeTimers: unknown) => {
    if (Array.isArray(activeTimers)) {
      const timerList = activeTimers as TabTimer[];
      timers = new Map(timerList.map((timer) => [timer.tabId, timer]));
      renderItems(visibleItems);
    }
  })
  .catch((error) => debugError("Error fetching timers for popup:", error));

// Live filtering
input.addEventListener("input", refreshFilter);

// Keyboard navigation (same spirit as the in-page omnibar)
input.addEventListener("keydown", (e) => {
  const numItems = visibleItems.length;

  if (e.key === "ArrowDown") {
    selectedIndex = numItems === 0 ? -1 : (selectedIndex + 1) % numItems;
    updateSelection(true);
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    if (numItems === 0) {
      selectedIndex = -1;
    } else {
      selectedIndex = selectedIndex <= 0 ? numItems - 1 : selectedIndex - 1;
    }
    updateSelection(true);
    e.preventDefault();
  } else if (e.key === "ArrowRight") {
    if (numItems > 0) {
      selectedIndex = Math.min(selectedIndex + 5, numItems - 1);
      updateSelection(true);
    }
    e.preventDefault();
  } else if (e.key === "ArrowLeft") {
    if (numItems > 0) {
      selectedIndex = Math.max(selectedIndex - 5, 0);
      updateSelection(true);
    }
    e.preventDefault();
  } else if (e.key === "Enter" && selectedIndex >= 0 && numItems > 0) {
    const selected = visibleItems[selectedIndex];
    if (selected) {
      activateItem(selected);
    }
    e.preventDefault();
  } else if (e.key === "Escape") {
    window.close();
    e.preventDefault();
  }
});

// Let the popup finish opening before asking the browser to move focus.
setTimeout(focusSearchInput, 100);

setInterval(() => {
  const now = Date.now();
  list.querySelectorAll<HTMLElement>(".zen-timer-countdown").forEach((countdown) => {
    const endAt = Number(countdown.dataset.endAt);
    if (Number.isFinite(endAt)) {
      countdown.textContent = `⏱ ${formatTimerClock(endAt - now)}`;
    }
  });
  list.querySelectorAll<HTMLInputElement>("input[type='datetime-local']").forEach((field) => {
    const preview = field.closest(".zen-timer-field")?.nextElementSibling;
    if (!(preview instanceof HTMLElement) || !preview.classList.contains("zen-timer-preview")) {
      return;
    }
    const endAt = fromDatetimeLocalValue(field.value);
    preview.textContent = isAllowedTimerEnd(endAt, now)
      ? formatTimerCountdown(endAt, now)
      : "Choose a time between 1 minute and 31 days from now.";
  });
}, 1000);

debugLog("Zen Tab Search popup opened");
