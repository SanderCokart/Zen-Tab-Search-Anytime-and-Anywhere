import { formatError, LOG_PREFIX } from "@/lib/background/log";
import { isUsableTabId } from "@/lib/types";

let timerPopupWindowId: number | undefined;

export function forgetTimerPopupWindow(windowId: number): void {
  if (windowId === timerPopupWindowId) {
    timerPopupWindowId = undefined;
  }
}

export async function openCustomTimerPopup(tabId: number): Promise<void> {
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
      width: 420,
      height: 420,
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
