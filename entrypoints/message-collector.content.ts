import { MESSAGE_TYPES } from "../lib/constants";
import { detectSource, getExtractor } from "../lib/extractors/registry";
import type { CollectResult } from "../lib/types";

export default defineContentScript({
  matches: [
    "*://*.freshdesk.com/*",
    "*://*.freshworks.com/*",
    "*://*.myfreshworks.com/*",
    "*://gitlab.com/*",
    "*://*.gitlab.com/*",
    "*://*/*gitlab*/*",
  ],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === MESSAGE_TYPES.DETECT_SOURCE) {
        sendResponse({ source: detectSource() });
        return false;
      }

      if (message?.type !== MESSAGE_TYPES.COLLECT_MESSAGES) {
        return false;
      }

      const run = async (): Promise<CollectResult> => {
        const extractor = getExtractor(message.source);
        if (!extractor) {
          return {
            ok: false,
            error:
              "No message extractor available for this page. Open a Freshdesk ticket or GitLab discussion.",
            source: detectSource() ?? undefined,
            messages: [],
            pageUrl: location.href,
            collectedAt: new Date().toISOString(),
          };
        }

        try {
          return await extractor.collectMessages({
            scrollToLoad: Boolean(message.scrollToLoad),
            includeHtml: Boolean(message.includeHtml),
          });
        } catch (err) {
          return {
            ok: false,
            source: extractor.id,
            error: err instanceof Error ? err.message : String(err),
            messages: [],
            pageUrl: location.href,
            collectedAt: new Date().toISOString(),
          };
        }
      };

      run().then(sendResponse);
      return true;
    });
  },
});
