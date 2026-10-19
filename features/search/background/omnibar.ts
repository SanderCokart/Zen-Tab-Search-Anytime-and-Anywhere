import { debugLog } from "@/shared/debug";
import { sendTabMessage } from "@/shared/messaging/client";
import { isUsableTabId } from "@/shared/types";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { toggleSearchPopup } from "@/features/search/background/popup";
import { isContentScriptInjectableUrl } from "@/shared/urls";
import { resolveAnchorTabId } from "@/features/zen/anchor";

export interface ToggleOmnibarOptions {
  /** The command tab's URL, which saves a `tabs.get` when it is the anchor. */
  preferredUrl?: string;
  /**
   * Starts the snapshot read for the anchor tab, so it runs while the content
   * script builds the overlay instead of after the overlay asks for it.
   */
  warmSnapshot?: (anchorTabId: number) => void;
}

export async function toggleOmnibar(
  preferredTabId?: number,
  options: ToggleOmnibarOptions = {},
): Promise<void> {
  const tabId = await resolveAnchorTabId(preferredTabId);
  if (!isUsableTabId(tabId)) {
    await toggleSearchPopup();
    return;
  }

  let url: string | undefined;
  if (tabId === preferredTabId && options.preferredUrl !== undefined) {
    url = options.preferredUrl;
  } else {
    try {
      url = (await browser.tabs.get(tabId)).url;
    } catch {
      url = undefined;
    }
  }

  if (isContentScriptInjectableUrl(url)) {
    options.warmSnapshot?.(tabId);
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
