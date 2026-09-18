import { render } from "preact";
import { debugLog } from "@/shared/debug";
import { parseContentCommand } from "@/shared/messaging/protocol";
import { SearchApp } from "@/features/search/ui/SearchApp";
import "@/shared/ui/styles.css";

const OMNIBAR_Z_INDEX = 2147483646;

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  cssInjectionMode: "ui",
  async main(ctx) {
    debugLog("Zen Tab Search content script loaded at", new Date().toISOString());

    let omnibar: Awaited<ReturnType<typeof createShadowRootUi>> | undefined;

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

    const hideOmnibar = () => {
      document.removeEventListener("keydown", escapeListener, true);
      document.removeEventListener("visibilitychange", visibilityListener);
      omnibar?.shadowHost.hidePopover();
      omnibar?.remove();
      omnibar = undefined;
    };

    const escapeListener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && omnibar) {
        event.preventDefault();
        event.stopPropagation();
        hideOmnibar();
      }
    };
    const visibilityListener = () => {
      if (document.hidden) hideOmnibar();
    };

    async function showOmnibar(): Promise<void> {
      if (omnibar) return;

      omnibar = await createShadowRootUi(ctx, {
        name: "zen-tab-search",
        position: "modal",
        zIndex: OMNIBAR_Z_INDEX,
        css: `
          :host {
            z-index: ${OMNIBAR_Z_INDEX} !important;
            position: fixed !important;
            inset: 0 !important;
            display: block !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            overflow: hidden !important;
            background: transparent !important;
          }
        `,
        isolateEvents: true,
        onMount(container) {
          const app = document.createElement("div");
          app.className = "h-full";
          container.append(app);
          render(<SearchApp onClose={hideOmnibar} pageJump={5} layout="overlay" />, app);
          return app;
        },
        onRemove(app) {
          if (app) render(null, app);
        },
      });

      document.addEventListener("keydown", escapeListener, true);
      document.addEventListener("visibilitychange", visibilityListener);
      omnibar.shadowHost.setAttribute("popover", "manual");
      omnibar.mount();
      omnibar.shadowHost.showPopover();
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const command = parseContentCommand(message);
      if (!command) return;
      if (command.type === "getForgePageInfo") {
        sendResponse(collectForgePageInfo());
        return;
      }
      if (command.type === "toggleOmnibar") {
        if (omnibar) hideOmnibar();
        else void showOmnibar();
      }
      if (command.type === "showOmnibar") void showOmnibar();
    });
  },
});
