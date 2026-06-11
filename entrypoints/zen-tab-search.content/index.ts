import "./style.css";
import { debugError, debugLog } from "../../lib/debug";
import type { SearchItem, SpaceInfo, TabInfo } from "../../lib/types";
import { formatSpaceDisplayTitle, formatTabDisplayTitle, isActivatableTab } from "../../lib/types";
import { buildSearchItems, filterSearchItems } from "../../lib/search";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  main() {
    debugLog("Zen Tab Search content script loaded at", new Date().toISOString());

    function showOmnibar() {
      debugLog("showOmnibar called at", new Date().toISOString());
      if (document.getElementById("zen-tab-omnibar-overlay")) {
        debugLog("Overlay already exists, skipping");
        return;
      }

      const overlay = document.createElement("div");
      overlay.id = "zen-tab-omnibar-overlay";
      overlay.className = "zen-overlay";

      const omnibar = document.createElement("div");
      omnibar.className = "zen-omnibar";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Search tabs and spaces...";
      input.className = "zen-input";
      input.autofocus = true;

      const list = document.createElement("ul");
      list.className = "zen-list";

      omnibar.appendChild(input);
      omnibar.appendChild(list);
      overlay.appendChild(omnibar);
      document.body.appendChild(overlay);
      input.focus();

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

      function closeOmnibar() {
        const existingOverlay = document.getElementById("zen-tab-omnibar-overlay");
        if (!existingOverlay) {
          return;
        }

        existingOverlay.remove();
        document.removeEventListener("keydown", escListener);
        document.removeEventListener("visibilitychange", visibilityListener);
      }

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          closeOmnibar();
        }
      });

      Promise.all([
        browser.runtime.sendMessage({ type: "getTabs" }) as Promise<TabInfo[]>,
        browser.runtime.sendMessage({ type: "getSpaces" }) as Promise<SpaceInfo[]>,
      ])
        .then(([tabs, spaces]) => {
          const allTabs = tabs.filter(isActivatableTab);
          const allSpaces = Array.isArray(spaces) ? spaces : [];
          let visibleItems = buildSearchItems(allTabs, allSpaces);
          let selectedIndex = -1;

          function updateSelection() {
            const items = list.querySelectorAll("li");
            items.forEach((item) => item.classList.remove("selected"));
            if (selectedIndex >= 0 && selectedIndex < items.length) {
              items[selectedIndex]!.classList.add("selected");
              items[selectedIndex]!.scrollIntoView({ block: "nearest" });
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

                const title = document.createElement("span");
                title.textContent = formatSpaceDisplayTitle(item.data);
                title.className = "zen-title";

                const subtitle = document.createElement("span");
                subtitle.textContent = item.data.isActive ? "Current space" : "Space";
                subtitle.className = "zen-url";

                li.appendChild(title);
                li.appendChild(subtitle);
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

                const title = document.createElement("span");
                title.textContent = formatTabDisplayTitle(item.data);
                title.className = "zen-title";

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

                li.appendChild(title);
                li.appendChild(url);
              }

              li.addEventListener("click", () => {
                activateItem(item);
              });
              list.appendChild(li);
            });

            selectedIndex = filteredItems.length > 0 ? 0 : -1;
            updateSelection();
          }

          renderItems(visibleItems);

          input.addEventListener("input", (e) => {
            const query = (e.target as HTMLInputElement).value;
            visibleItems = filterSearchItems(buildSearchItems(allTabs, allSpaces), query);
            renderItems(visibleItems);
          });

          input.addEventListener("keydown", (e) => {
            const items = list.querySelectorAll("li");
            const numItems = items.length;

            if (e.key === "ArrowDown") {
              selectedIndex = selectedIndex < numItems - 1 ? selectedIndex + 1 : 0;
              updateSelection();
              e.preventDefault();
            } else if (e.key === "ArrowUp") {
              selectedIndex = selectedIndex <= 0 ? numItems - 1 : selectedIndex - 1;
              updateSelection();
              e.preventDefault();
            } else if (e.key === "ArrowRight") {
              selectedIndex = Math.min(selectedIndex + 10, numItems - 1);
              updateSelection();
              e.preventDefault();
            } else if (e.key === "ArrowLeft") {
              selectedIndex = Math.max(selectedIndex - 10, 0);
              updateSelection();
              e.preventDefault();
            } else if (e.key === "Enter" && selectedIndex >= 0 && numItems > 0) {
              const selected = visibleItems[selectedIndex];
              if (selected) {
                activateItem(selected);
              }
              e.preventDefault();
            }
          });
        })
        .catch((error) => {
          console.error("Error fetching tabs and spaces:", error);
        });
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === "showOmnibar") {
        showOmnibar();
      }
    });
  },
});
