import { isUsableTabId } from "@/lib/types";
import { formatError, LOG_PREFIX } from "@/lib/background/log";

let settingsPopupWindowId: number | undefined;

export function forgetSettingsPopupWindow(windowId: number): void {
  if (windowId === settingsPopupWindowId) {
    settingsPopupWindowId = undefined;
  }
}

export async function openSettingsPopup(): Promise<void> {
  if (isUsableTabId(settingsPopupWindowId)) {
    try {
      await browser.windows.update(settingsPopupWindowId, { focused: true });
      return;
    } catch {
      settingsPopupWindowId = undefined;
    }
  }

  try {
    const popupWindow = await browser.windows.create({
      url: browser.runtime.getURL("/options.html"),
      type: "popup",
      width: 460,
      height: 620,
    });
    if (isUsableTabId(popupWindow?.id)) {
      settingsPopupWindowId = popupWindow.id;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not open settings popup:`, formatError(error));
  }
}
