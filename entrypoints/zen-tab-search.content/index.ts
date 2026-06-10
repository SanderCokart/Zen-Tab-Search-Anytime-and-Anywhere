import "./style.css";

interface TabInfo {
  id: number;
  title: string;
  customLabel?: string;
  url: string;
  favIconUrl: string;
  windowId: number;
  score?: number;
}

function formatTabDisplayTitle(tab: TabInfo): string {
  const title = tab.title || "Untitled";
  const customLabel = tab.customLabel?.trim();
  if (customLabel) {
    return `${customLabel} | ${title}`;
  }
  return title;
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

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  main() {
    console.log("Zen Tab Search content script loaded at", new Date().toISOString());

    function showOmnibar() {
      console.log("showOmnibar called at", new Date().toISOString());
      if (document.getElementById("zen-tab-omnibar-overlay")) {
        console.log("Overlay already exists, skipping");
        return;
      }

      const overlay = document.createElement("div");
      overlay.id = "zen-tab-omnibar-overlay";
      overlay.className = "zen-overlay";

      const omnibar = document.createElement("div");
      omnibar.className = "zen-omnibar";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Search tabs...";
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

      browser.runtime
        .sendMessage({ type: "getTabs" })
        .then((tabs: TabInfo[]) => {
          const allTabs = tabs.filter((tab) => Number.isInteger(tab.id) && tab.id >= 0);
          let selectedIndex = -1;

          function updateSelection() {
            const items = list.querySelectorAll("li");
            items.forEach((item) => item.classList.remove("selected"));
            if (selectedIndex >= 0 && selectedIndex < items.length) {
              items[selectedIndex]!.classList.add("selected");
              items[selectedIndex]!.scrollIntoView({ block: "nearest" });
            }
          }

          function switchToTab(tabId: number) {
            if (!Number.isInteger(tabId) || tabId < 0) {
              return;
            }

            browser.runtime
              .sendMessage({ type: "switchTab", tabId })
              .then((response: { error?: string }) => {
                if (response?.error) {
                  console.error("Error response from switchTab:", response.error);
                  return;
                }
                closeOmnibar();
              })
              .catch((error) => {
                console.error("Error sending switchTab message:", error);
              });
          }

          function renderTabs(filteredTabs: TabInfo[]) {
            list.innerHTML = "";
            filteredTabs.forEach((tab) => {
              const li = document.createElement("li");
              li.className = "zen-tab-item";
              li.dataset.tabId = String(tab.id);

              if (tab.favIconUrl) {
                const img = document.createElement("img");
                img.src = tab.favIconUrl;
                img.className = "zen-favicon";
                li.appendChild(img);
              }

              const title = document.createElement("span");
              title.textContent = formatTabDisplayTitle(tab);
              title.className = "zen-title";

              const url = document.createElement("span");
              try {
                url.textContent = tab.url ? new URL(tab.url).hostname : "No URL";
              } catch {
                url.textContent = "No URL";
              }
              url.className = "zen-url";

              li.appendChild(title);
              li.appendChild(url);
              li.addEventListener("click", () => {
                switchToTab(tab.id);
              });
              list.appendChild(li);
            });

            selectedIndex = filteredTabs.length > 0 ? 0 : -1;
            updateSelection();
          }

          renderTabs(allTabs);

          input.addEventListener("input", (e) => {
            const query = (e.target as HTMLInputElement).value;
            if (!query) {
              renderTabs(allTabs);
              return;
            }

            const queryLowerCase = query.toLowerCase();
            const scored = allTabs
              .map((tab) => {
                const labelMatch = fuzzyMatchWithScore(tab.customLabel || "", queryLowerCase);
                const titleMatch = fuzzyMatchWithScore(tab.title || "", queryLowerCase);
                const urlMatch = fuzzyMatchWithScore(tab.url || "", queryLowerCase);
                if (!labelMatch.matches && !titleMatch.matches && !urlMatch.matches) {
                  return null;
                }
                return {
                  ...tab,
                  score: Math.max(labelMatch.score, titleMatch.score, urlMatch.score),
                };
              })
              .filter((tab): tab is TabInfo => tab !== null)
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

            renderTabs(scored);
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
              const selectedItem = items[selectedIndex] as HTMLLIElement;
              switchToTab(parseInt(selectedItem.dataset.tabId ?? "", 10));
              e.preventDefault();
            }
          });
        })
        .catch((error) => {
          console.error("Error fetching tabs:", error);
        });
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === "showOmnibar") {
        showOmnibar();
      }
    });
  },
});
