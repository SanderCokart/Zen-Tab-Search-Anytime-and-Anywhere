import { debugError, debugLog } from "../../lib/debug";
import { sendExtensionMessage } from "../../lib/messaging/client";
import type { SearchItem, SpaceInfo, TabInfo, TabTimer } from "../../lib/types";
import { formatSpaceDisplayTitle, isActivatableTab } from "../../lib/types";
import { buildSearchItems, filterSearchItems, prioritizeCurrentTab } from "../../lib/search";
import {
  createIconButton,
  createTimerIcon,
  renderActiveTimersPanel,
  renderTabTimerBlock,
  syncActiveTimersButton,
  tickTimerDisplays,
  type TimerUiController,
} from "../../lib/timer-ui";

const input = document.getElementById("search-input") as HTMLInputElement;
const list = document.getElementById("results") as HTMLUListElement;
const emptyEl = document.getElementById("empty") as HTMLDivElement;
const searchRow = document.getElementById("search-row") as HTMLDivElement;
const activeTimersPanel = document.getElementById("active-timers-panel") as HTMLDivElement;
let allTabs: TabInfo[] = [];
let allSpaces: SpaceInfo[] = [];
let visibleItems: SearchItem[] = [];
let selectedIndex = -1;
let timers = new Map<number, TabTimer>();
const openTimerTabs = new Set<number>();
const timerDrafts = new Map<number, number>();
let activeTimersOpen = false;

const timerUi: TimerUiController = {
  get timers() {
    return timers;
  },
  openTimerTabs,
  timerDrafts,
  onChange() {
    renderItems(visibleItems);
    renderActiveTimers();
  },
};

const activeTimersButton = createIconButton({
  title: "Show active timers",
  icon: createTimerIcon(),
  onClick: () => {
    activeTimersOpen = !activeTimersOpen;
    renderActiveTimers();
  },
});
searchRow.appendChild(activeTimersButton);
renderActiveTimers();

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

function renderActiveTimers(): void {
  syncActiveTimersButton(activeTimersButton, timers.size, activeTimersOpen);
  activeTimersPanel.hidden = !activeTimersOpen;
  if (!activeTimersOpen) {
    activeTimersPanel.replaceChildren();
    return;
  }
  renderActiveTimersPanel(activeTimersPanel, timerUi, {
    onActivateTab: (tabId) => {
      void sendExtensionMessage({ type: "switchTab", tabId })
        .then(() => window.close())
        .catch((error) => debugError("Error response from switchTab:", error));
    },
  });
}

function activateItem(item: SearchItem) {
  if (item.kind === "space") {
    void sendExtensionMessage({ type: "switchSpace", spaceId: item.data.id })
      .then(() => window.close())
      .catch((error) => debugError("Error sending switchSpace message:", error));
    return;
  }

  if (!isActivatableTab(item.data)) {
    return;
  }

  void sendExtensionMessage({
    type: "switchTab",
    tabId: Number.isInteger(item.data.id) && item.data.id! >= 0 ? item.data.id : undefined,
    domId: item.data.domId || undefined,
  })
    .then(() => window.close())
    .catch((error) => debugError("Error sending switchTab message:", error));
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
      text.appendChild(renderTabTimerBlock(item.data, timerUi));

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

function applyTabs(tabs: TabInfo[]): void {
  allTabs = tabs.filter(isActivatableTab);
}

function applySpaces(spaces: SpaceInfo[]): void {
  allSpaces = spaces;
}

// Initial data load — works without an active content tab; background uses Zen experiment fallbacks.
void sendExtensionMessage({ type: "getTabs" })
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

void sendExtensionMessage({ type: "getSpaces" })
  .then((spaces) => {
    applySpaces(spaces);
    visibleItems = visibleSearchItems(input.value);
    renderItems(visibleItems);
  })
  .catch((error) => debugError("Error fetching spaces for popup:", error));

void sendExtensionMessage({ type: "getTimers" })
  .then((activeTimers) => {
    timers = new Map(activeTimers.map((timer) => [timer.tabId, timer]));
    renderItems(visibleItems);
    renderActiveTimers();
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

setInterval(() => tickTimerDisplays(document), 1000);

debugLog("Zen Tab Search popup opened");
