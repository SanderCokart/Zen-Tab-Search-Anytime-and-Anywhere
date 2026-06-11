import "./style.css";
import { debugError, debugLog } from "../../lib/debug";

interface TabInfo {
  id: number | null;
  domId?: string;
  title: string;
  customLabel?: string;
  url: string;
  favIconUrl: string;
  windowId: number;
  workspaceId?: string;
  workspaceName?: string;
  score?: number;
}

interface SpaceInfo {
  id: string;
  name: string;
  icon?: string;
  isActive: boolean;
  score?: number;
}

type SearchItem =
  | { kind: "tab"; data: TabInfo }
  | { kind: "space"; data: SpaceInfo };

function formatTabDisplayTitle(tab: TabInfo): string {
  const title = tab.title || "Untitled";
  const customLabel = tab.customLabel?.trim();
  if (customLabel) {
    return `${customLabel} | ${title}`;
  }
  return title;
}

function formatSpaceDisplayTitle(space: SpaceInfo): string {
  return space.name;
}

function isActivatableTab(tab: TabInfo): boolean {
  return (
    (Number.isInteger(tab.id) && tab.id! >= 0) ||
    (typeof tab.domId === "string" && tab.domId.length > 0)
  );
}

interface FuzzyMatch {
  matches: boolean;
  score: number;
}

function fuzzyMatchWithScore(str: string, queryLowerCase: string): FuzzyMatch {
  const normalized = str.toLowerCase();
  let strIndex = 0;
  const matchPositions: number[] = [];

  for (let queryIndex = 0; queryIndex < queryLowerCase.length; queryIndex++) {
    const char = queryLowerCase[queryIndex];
    const found = normalized.indexOf(char, strIndex);

    if (found === -1) {
      return { matches: false, score: 0 };
    }

    matchPositions.push(found);
    strIndex = found + 1;
  }

  let score = 0;

  if (normalized.includes(queryLowerCase)) {
    score += 1000;
    const queryIndex = normalized.indexOf(queryLowerCase);
    if (queryIndex === 0 || /\s/.test(normalized[queryIndex - 1] ?? "")) {
      score += 500;
    }
  }

  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(queryLowerCase)) {
      score += 200;
    } else if (word.includes(queryLowerCase)) {
      score += 100;
    }
  }

  let consecutiveBonus = 0;
  for (let i = 1; i < matchPositions.length; i++) {
    if (matchPositions[i] === matchPositions[i - 1]! + 1) {
      consecutiveBonus += 50;
    }
  }
  score += consecutiveBonus;

  const firstMatchPosition = matchPositions[0] ?? 0;
  score += Math.max(0, 100 - firstMatchPosition * 2);
  score += Math.max(0, 200 - normalized.length);

  const matchSpan =
    matchPositions[matchPositions.length - 1]! - matchPositions[0]! + 1;
  score += Math.max(0, 100 - matchSpan);

  return { matches: true, score };
}

function buildSearchItems(allTabs: TabInfo[], allSpaces: SpaceInfo[]): SearchItem[] {
  const items: SearchItem[] = allSpaces.map((space) => ({ kind: "space", data: space }));
  for (const tab of allTabs) {
    items.push({ kind: "tab", data: tab });
  }
  return items;
}

function filterSearchItems(items: SearchItem[], query: string): SearchItem[] {
  if (!query) {
    return items;
  }

  const queryLowerCase = query.toLowerCase();
  const scored: SearchItem[] = [];

  for (const item of items) {
    if (item.kind === "space") {
      const nameMatch = fuzzyMatchWithScore(item.data.name, queryLowerCase);
      const iconMatch = fuzzyMatchWithScore(item.data.icon || "", queryLowerCase);
      if (!nameMatch.matches && !iconMatch.matches) {
        continue;
      }

      scored.push({
        kind: "space",
        data: {
          ...item.data,
          score: Math.max(nameMatch.score, iconMatch.score) + 300,
        },
      });
      continue;
    }

    const labelMatch = fuzzyMatchWithScore(item.data.customLabel || "", queryLowerCase);
    const titleMatch = fuzzyMatchWithScore(item.data.title || "", queryLowerCase);
    const urlMatch = fuzzyMatchWithScore(item.data.url || "", queryLowerCase);
    const workspaceMatch = fuzzyMatchWithScore(item.data.workspaceName || "", queryLowerCase);
    if (!labelMatch.matches && !titleMatch.matches && !urlMatch.matches && !workspaceMatch.matches) {
      continue;
    }

    scored.push({
      kind: "tab",
      data: {
        ...item.data,
        score: Math.max(
          labelMatch.score,
          titleMatch.score,
          urlMatch.score,
          workspaceMatch.score,
        ),
      },
    });
  }

  return scored.sort((a, b) => (b.data.score ?? 0) - (a.data.score ?? 0));
}

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
              li.className =
                item.kind === "space" ? "zen-tab-item zen-space-item" : "zen-tab-item";
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
