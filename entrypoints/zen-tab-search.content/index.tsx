import "./style.css";
import { render } from "preact";
import { debugLog } from "../../lib/debug";
import { parseContentCommand } from "../../lib/messaging/protocol";
import { SearchApp } from "../../ui/search/SearchApp";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  main() {
    debugLog("Zen Tab Search content script loaded at", new Date().toISOString());

    let closeOmnibar: (() => void) | undefined;

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
        .filter((element): element is Element => !!element)
        .map((element) =>
          "innerText" in element ? String((element as HTMLElement).innerText) : "",
        );

      return {
        title: titleEl?.textContent?.replace(/\s+/g, " ").trim() || "",
        bodyText: bodyParts.join("\n"),
      };
    }

    function showOmnibar(): void {
      if (document.getElementById("zen-tab-omnibar-overlay")) return;

      const overlay = document.createElement("div");
      overlay.id = "zen-tab-omnibar-overlay";
      overlay.className = "zen-overlay";
      const mount = document.createElement("div");
      mount.className = "zen-omnibar";
      overlay.appendChild(mount);
      document.body.appendChild(overlay);

      const close = () => {
        render(null, mount);
        overlay.remove();
        document.removeEventListener("keydown", escapeListener, true);
        document.removeEventListener("visibilitychange", visibilityListener);
        closeOmnibar = undefined;
      };
      const escapeListener = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      };
      const visibilityListener = () => {
        if (document.hidden) close();
      };
      closeOmnibar = close;
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
      });
      document.addEventListener("keydown", escapeListener, true);
      document.addEventListener("visibilitychange", visibilityListener);
      render(<SearchApp onClose={close} pageJump={10} />, mount);
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const command = parseContentCommand(message);
      if (!command) return;
      if (command.type === "getForgePageInfo") {
        sendResponse(collectForgePageInfo());
        return;
      }
      if (command.type === "toggleOmnibar") {
        if (closeOmnibar) closeOmnibar();
        else showOmnibar();
      }
      if (command.type === "showOmnibar") showOmnibar();
    });
  },
});
