import { isUsableTabId } from "@/shared/types";
import { formatError, LOG_PREFIX } from "@/shared/log";

let settingsPopupWindowId: number | undefined;

/** Narrow enough that Complexity stays one column; widen the window for two. */
const SETTINGS_POPUP_WIDTH = 460;
const SETTINGS_POPUP_HEIGHT = 620;

export function forgetSettingsPopupWindow(windowId: number): void {
  if (windowId === settingsPopupWindowId) {
    settingsPopupWindowId = undefined;
  }
}

export async function openSettingsPopup(): Promise<void> {
  if (isUsableTabId(settingsPopupWindowId)) {
    try {
      await browser.windows.update(settingsPopupWindowId, {
        focused: true,
        width: SETTINGS_POPUP_WIDTH,
        height: SETTINGS_POPUP_HEIGHT,
      });
      return;
    } catch {
      settingsPopupWindowId = undefined;
    }
  }

  try {
    const popupWindow = await browser.windows.create({
      url: browser.runtime.getURL("/options.html"),
      type: "popup",
      width: SETTINGS_POPUP_WIDTH,
      height: SETTINGS_POPUP_HEIGHT,
    });
    if (isUsableTabId(popupWindow?.id)) {
      settingsPopupWindowId = popupWindow.id;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not open settings popup:`, formatError(error));
  }
}
