import "./style.css";
import { debugError, debugLog } from "../../lib/debug";
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

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  main() {
    debugLog("Zen Tab Search content script loaded at", new Date().toISOString());

    function focusSearchInput(input: HTMLInputElement) {
      input.focus();
      input.select();
    }

    let activeOmnibarClose: (() => void) | null = null;

    function closeOmnibarIfOpen(): boolean {
      const overlay = document.getElementById("zen-tab-omnibar-overlay");
      if (!overlay) {
        return false;
      }

      if (activeOmnibarClose) {
        activeOmnibarClose();
        activeOmnibarClose = null;
      } else {
        overlay.remove();
      }

      debugLog("Omnibar closed at", new Date().toISOString());
      return true;
    }

    function toggleOmnibar(): void {
      if (closeOmnibarIfOpen()) {
        return;
      }

      showOmnibar();
    }

    function showOmnibar() {
      debugLog("showOmnibar called at", new Date().toISOString());
      if (document.getElementById("zen-tab-omnibar-overlay")) {
        return;
      }

      const overlay = document.createElement("div");
      overlay.id = "zen-tab-omnibar-overlay";
      overlay.className = "zen-overlay";

      const omnibar = document.createElement("div");
      omnibar.className = "zen-omnibar";

      const searchRow = document.createElement("div");
      searchRow.className = "zen-search-row";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Search tabs and spaces...";
      input.className = "zen-input";
      input.autofocus = true;

      const activeTimersPanel = document.createElement("div");
      activeTimersPanel.className = "zen-active-timers";
      activeTimersPanel.hidden = true;

      const list = document.createElement("ul");
      list.className = "zen-list";

      let allTabs: TabInfo[] = [];
      let allSpaces: SpaceInfo[] = [];
      let timers = new Map<number, TabTimer>();
      const openTimerTabs = new Set<number>();
      const timerDrafts = new Map<number, number>();
      let activeTimersOpen = false;
      let visibleItems: SearchItem[] = [];
      let selectedIndex = -1;
      let tickId = 0;

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

      function renderActiveTimers(): void {
        syncActiveTimersButton(activeTimersButton, timers.size, activeTimersOpen);
        activeTimersPanel.hidden = !activeTimersOpen;
        if (!activeTimersOpen) {
          activeTimersPanel.replaceChildren();
          return;
        }
        renderActiveTimersPanel(activeTimersPanel, timerUi, {
          onActivateTab: (tabId) => {
            void browser.runtime
              .sendMessage({ type: "switchTab", tabId })
              .then((response: { error?: string }) => {
                if (response?.error) {
                  debugError("Error response from switchTab:", response.error);
                  return;
                }
                closeOmnibar();
              });
          },
        });
      }

      const activeTimersButton = createIconButton({
        title: "Show active timers",
        icon: createTimerIcon(),
        onClick: () => {
          activeTimersOpen = !activeTimersOpen;
          renderActiveTimers();
        },
      });

      searchRow.append(input, activeTimersButton);
      omnibar.append(searchRow, activeTimersPanel, list);
      overlay.appendChild(omnibar);
      document.body.appendChild(overlay);
      setTimeout(() => {
        if (overlay.isConnected) {
          focusSearchInput(input);
        }
      }, 100);

      const escListener = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeOmnibar();
          e.preventDefault();
          e.stopPropagation();
        }
      };

      document.addEventListener("keydown", escListener);

      const visibilityListener = () => {
        if (document.hidden) {
          closeOmnibar();
        }
      };

      document.addEventListener("visibilitychange", visibilityListener);

      function currentId(): number | undefined {
        return allTabs.find((tab) => tab.active)?.id ?? undefined;
      }

      function refreshVisibleItems(query: string): void {
        const items = filterSearchItems(buildSearchItems(allTabs, allSpaces), query);
        visibleItems = query.trim() ? items : prioritizeCurrentTab(items, currentId());
      }

      function updateSelection(scrollSelectedIntoView = false) {
        const items = list.querySelectorAll("li");
        items.forEach((item) => item.classList.remove("selected"));
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          items[selectedIndex]!.classList.add("selected");
          if (scrollSelectedIntoView) {
            items[selectedIndex]!.scrollIntoView({ block: "nearest" });
          }
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
              closeOmnibar();
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
            closeOmnibar();
          })
          .catch((error) => {
            debugError("Error sending switchTab message:", error);
          });
      }

      function renderItems(filteredItems: SearchItem[]) {
        list.innerHTML = "";
        filteredItems.forEach((item) => {
          const li = document.createElement("li");
          li.className = item.kind === "space" ? "zen-tab-item zen-space-item" : "zen-tab-item";
          li.dataset.kind = item.kind;

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
            const subtitle = document.createElement("span");
            subtitle.textContent = item.data.isActive ? "Current space" : "Space";
            subtitle.className = "zen-url";
            text.append(title, subtitle);
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
              url.textContent = url.textContent
                ? `${url.textContent} · Current tab`
                : "Current tab";
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

      function closeOmnibar() {
        const existingOverlay = document.getElementById("zen-tab-omnibar-overlay");
        if (!existingOverlay) {
          return;
        }

        window.clearInterval(tickId);
        existingOverlay.remove();
        document.removeEventListener("keydown", escListener);
        document.removeEventListener("visibilitychange", visibilityListener);
        activeOmnibarClose = null;
      }

      activeOmnibarClose = closeOmnibar;

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          closeOmnibar();
        }
      });

      input.addEventListener("input", (e) => {
        refreshVisibleItems((e.target as HTMLInputElement).value);
        renderItems(visibleItems);
      });

      input.addEventListener("keydown", (e) => {
        const numItems = visibleItems.length;

        if (e.key === "ArrowDown") {
          selectedIndex = selectedIndex < numItems - 1 ? selectedIndex + 1 : 0;
          updateSelection(true);
          e.preventDefault();
        } else if (e.key === "ArrowUp") {
          selectedIndex = selectedIndex <= 0 ? numItems - 1 : selectedIndex - 1;
          updateSelection(true);
          e.preventDefault();
        } else if (e.key === "ArrowRight") {
          selectedIndex = Math.min(selectedIndex + 10, numItems - 1);
          updateSelection(true);
          e.preventDefault();
        } else if (e.key === "ArrowLeft") {
          selectedIndex = Math.max(selectedIndex - 10, 0);
          updateSelection(true);
          e.preventDefault();
        } else if (e.key === "Enter" && selectedIndex >= 0 && numItems > 0) {
          const selected = visibleItems[selectedIndex];
          if (selected) {
            activateItem(selected);
          }
          e.preventDefault();
        }
      });

      tickId = window.setInterval(() => tickTimerDisplays(omnibar), 1000);
      renderActiveTimers();

      void browser.runtime
        .sendMessage({ type: "getTabs" })
        .then((tabs: TabInfo[]) => {
          allTabs = Array.isArray(tabs) ? tabs.filter(isActivatableTab) : [];
          refreshVisibleItems(input.value);
          renderItems(visibleItems);
        })
        .catch((error) => {
          console.error("Error fetching tabs:", error);
        });

      void browser.runtime
        .sendMessage({ type: "getSpaces" })
        .then((spaces: SpaceInfo[]) => {
          allSpaces = Array.isArray(spaces) ? spaces : [];
          refreshVisibleItems(input.value);
          renderItems(visibleItems);
        })
        .catch((error) => {
          debugError("Error fetching spaces:", error);
        });

      void browser.runtime
        .sendMessage({ type: "getTimers" })
        .then((activeTimers: unknown) => {
          if (Array.isArray(activeTimers)) {
            timers = new Map((activeTimers as TabTimer[]).map((timer) => [timer.tabId, timer]));
            renderItems(visibleItems);
            renderActiveTimers();
          }
        })
        .catch((error) => debugError("Error fetching timers:", error));
    }

    function collectForgePageInfo() {
      const titleEl = document.querySelector(
        "h1, [data-testid='issue-title'], [data-testid='work-item-title'], .js-issue-title, bdi.js-issue-title",
      );
      const bodyParts = [
        document.querySelector("[data-testid='gfm-root']"),
        document.querySelector(".description"),
        document.querySelector("[data-testid='widget-related-issues']"),
        document.querySelector("[data-testid='related-issues-block']"),
        document.querySelector("[data-testid='closing-issues']"),
        document.querySelector(".js-issue-body"),
        document.querySelector(".js-comment-body"),
        document.querySelector(".comment-body"),
        document.querySelector("[data-testid='comment-body']"),
      ]
        .filter((el): el is Element => !!el)
        .map((el) => ("innerText" in el ? String((el as HTMLElement).innerText) : ""));

      return {
        title: titleEl?.textContent?.replace(/\s+/g, " ").trim() || "",
        bodyText: bodyParts.join("\n"),
      };
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "getForgePageInfo") {
        sendResponse(collectForgePageInfo());
        return;
      }

      if (message.type === "toggleOmnibar" || message.type === "showOmnibar") {
        toggleOmnibar();
      }
    });
  },
});
