import { formatError, LOG_PREFIX } from "@/shared/log";
import { isUsableTabId } from "@/shared/types";
import { openOmnibarView } from "@/features/search/background/omnibar";

let timerPopupWindowId: number | undefined;

export function forgetTimerPopupWindow(windowId: number): void {
  if (windowId === timerPopupWindowId) {
    timerPopupWindowId = undefined;
  }
}

export async function openCustomTimerPopup(tabId: number): Promise<void> {
  // The window-hosted omnibar shows these controls in place of its columns;
  // the popup window is only for when the experiment cannot host it.
  if (await openOmnibarView({ kind: "timer", tabId }).catch(() => false)) {
    return;
  }

  if (isUsableTabId(timerPopupWindowId)) {
    try {
      await browser.windows.remove(timerPopupWindowId);
    } catch {
      // Window was already closed.
    }
    timerPopupWindowId = undefined;
  }

  try {
    const popupWindow = await browser.windows.create({
      url: `${browser.runtime.getURL("/timer-popup.html")}?tabId=${tabId}`,
      type: "popup",
      width: 480,
      height: 460,
      focused: true,
    });
    const popupWindowId = popupWindow?.id;
    if (isUsableTabId(popupWindowId)) {
      timerPopupWindowId = popupWindowId;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not open custom timer popup:`, formatError(error));
  }
}
