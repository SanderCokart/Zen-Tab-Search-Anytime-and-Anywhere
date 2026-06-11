import { debugError, debugLog } from "../../lib/debug";
import type { SearchItem, SpaceInfo, TabInfo } from "../../lib/types";
import { formatSpaceDisplayTitle, formatTabDisplayTitle, isActivatableTab } from "../../lib/types";
import { buildSearchItems, filterSearchItems } from "../../lib/search";
import "./style.css";

const input = document.getElementById("search-input") as HTMLInputElement;
const list = document.getElementById("results") as HTMLUListElement;
const emptyEl = document.getElementById("empty") as HTMLDivElement;

let allTabs: TabInfo[] = [];
let allSpaces: SpaceInfo[] = [];
let visibleItems: SearchItem[] = [];
let selectedIndex = -1;

function isErrorResponse(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

function updateSelection() {
  const items = list.querySelectorAll("li");
  items.forEach((item) => item.classList.remove("selected"));
  if (selectedIndex >= 0 && selectedIndex < items.length) {
    const el = items[selectedIndex]!;
    el.classList.add("selected");
    el.scrollIntoView({ block: "nearest" });
  }
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

      const title = document.createElement("span");
      title.textContent = formatTabDisplayTitle(item.data);
      title.className = "zen-title";
      text.appendChild(title);

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
  visibleItems = filterSearchItems(buildSearchItems(allTabs, allSpaces), query);
  renderItems(visibleItems);
}

emptyEl.textContent = "Loading tabs and spaces…";
emptyEl.hidden = false;

// Initial data load — works without an active content tab; background uses Zen experiment fallbacks.
Promise.all([
  browser.runtime.sendMessage({ type: "getTabs" }),
  browser.runtime.sendMessage({ type: "getSpaces" }),
])
  .then(([tabs, spaces]) => {
    if (isErrorResponse(tabs)) {
      throw new Error(tabs.error);
    }
    if (isErrorResponse(spaces)) {
      throw new Error(spaces.error);
    }

    allTabs = Array.isArray(tabs) ? tabs.filter(isActivatableTab) : [];
    allSpaces = Array.isArray(spaces) ? spaces : [];
    visibleItems = buildSearchItems(allTabs, allSpaces);
    renderItems(visibleItems);
  })
  .catch((error) => {
    debugError("Error fetching tabs and spaces for popup:", error);
    emptyEl.textContent = "Unable to load tabs. Make sure the extension is enabled in Zen Browser.";
    emptyEl.hidden = false;
  });

// Live filtering
input.addEventListener("input", refreshFilter);

// Keyboard navigation (same spirit as the in-page omnibar)
input.addEventListener("keydown", (e) => {
  const numItems = visibleItems.length;

  if (e.key === "ArrowDown") {
    selectedIndex = numItems === 0 ? -1 : (selectedIndex + 1) % numItems;
    updateSelection();
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    if (numItems === 0) {
      selectedIndex = -1;
    } else {
      selectedIndex = selectedIndex <= 0 ? numItems - 1 : selectedIndex - 1;
    }
    updateSelection();
    e.preventDefault();
  } else if (e.key === "ArrowRight") {
    if (numItems > 0) {
      selectedIndex = Math.min(selectedIndex + 5, numItems - 1);
      updateSelection();
    }
    e.preventDefault();
  } else if (e.key === "ArrowLeft") {
    if (numItems > 0) {
      selectedIndex = Math.max(selectedIndex - 5, 0);
      updateSelection();
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

// Focus the input in case autofocus didn't take in some environments
setTimeout(() => {
  input.focus();
  input.select();
}, 0);

debugLog("Zen Tab Search popup opened");
