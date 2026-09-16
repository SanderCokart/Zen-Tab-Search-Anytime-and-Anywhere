import { debugLog } from "../../debug";
import { sendTabMessage } from "../../messaging/client";
import { isUsableTabId } from "../../types";
import { formatError, LOG_PREFIX } from "../log";
import { toggleSearchPopup } from "../popups/search";
import { isContentScriptInjectableUrl } from "../urls";

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
