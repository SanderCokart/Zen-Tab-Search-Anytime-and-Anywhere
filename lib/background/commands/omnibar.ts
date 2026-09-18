import { debugLog } from "@/lib/debug";
import { sendTabMessage } from "@/lib/messaging/client";
import { isUsableTabId } from "@/lib/types";
import { formatError, LOG_PREFIX } from "@/lib/background/log";
import { toggleSearchPopup } from "@/lib/background/popups/search";
import { isContentScriptInjectableUrl } from "@/lib/background/urls";

export async function toggleOmnibar(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const tabId = tab?.id;

  if (isUsableTabId(tabId) && isContentScriptInjectableUrl(tab?.url)) {
    try {
      await sendTabMessage(tabId, { type: "toggleOmnibar", anchorTabId: tabId });
      return;
    } catch (error) {
      debugLog(
        `${LOG_PREFIX} In-page omnibar unavailable, falling back to popup:`,
        formatError(error),
      );
    }
  }

  await toggleSearchPopup();
}
