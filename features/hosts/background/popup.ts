import { formatError, LOG_PREFIX } from "@/shared/log";
import { isUsableTabId } from "@/shared/types";
import { openOmnibarView } from "@/features/search/background/omnibar";

let hostsPopupWindowId: number | undefined;

export function forgetHostOverridesPopupWindow(windowId: number): void {
  if (windowId === hostsPopupWindowId) {
    hostsPopupWindowId = undefined;
  }
}

/** Opens the host override editor for a tab, replacing one already open. */
export async function openHostOverridesPopup(tabId: number): Promise<void> {
  // The window-hosted omnibar shows these controls in place of its columns;
  // the popup window is only for when the experiment cannot host it.
  if (await openOmnibarView({ kind: "hosts", tabId }).catch(() => false)) {
    return;
  }

  if (isUsableTabId(hostsPopupWindowId)) {
    try {
      await browser.windows.remove(hostsPopupWindowId);
    } catch {
      // Window was already closed.
    }
    hostsPopupWindowId = undefined;
  }

  try {
    const popupWindow = await browser.windows.create({
      url: `${browser.runtime.getURL("/host-overrides-popup.html")}?tabId=${tabId}`,
      type: "popup",
      width: 560,
      height: 680,
      focused: true,
    });
    const popupWindowId = popupWindow?.id;
    if (isUsableTabId(popupWindowId)) {
      hostsPopupWindowId = popupWindowId;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not open the host override popup:`, formatError(error));
  }
}
