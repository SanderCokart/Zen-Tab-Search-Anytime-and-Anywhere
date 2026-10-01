import { debugLog } from "@/shared/debug";
import { sendTabMessage } from "@/shared/messaging/client";
import { isUsableTabId } from "@/shared/types";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { toggleSearchPopup } from "@/features/search/background/popup";
import { isContentScriptInjectableUrl } from "@/shared/urls";
import { resolveAnchorTabId } from "@/features/zen/anchor";

export async function toggleOmnibar(preferredTabId?: number): Promise<void> {
  const tabId = await resolveAnchorTabId(preferredTabId);
  if (!isUsableTabId(tabId)) {
    await toggleSearchPopup();
    return;
  }

  let url: string | undefined;
  try {
    url = (await browser.tabs.get(tabId)).url;
  } catch {
    url = undefined;
  }

  if (isContentScriptInjectableUrl(url)) {
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
