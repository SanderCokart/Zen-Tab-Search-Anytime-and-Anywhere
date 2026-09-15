import { forgetSearchPopupWindow } from "./search";
import { forgetTimerPopupWindow } from "./timer";

export function registerPopupWindowTracking(): void {
  browser.windows.onRemoved.addListener((windowId) => {
    forgetSearchPopupWindow(windowId);
    forgetTimerPopupWindow(windowId);
  });
}
