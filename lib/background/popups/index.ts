import { forgetSearchPopupWindow } from "./search";
import { forgetSettingsPopupWindow } from "./settings";
import { forgetTimerPopupWindow } from "./timer";

export function registerPopupWindowTracking(): void {
  browser.windows.onRemoved.addListener((windowId) => {
    forgetSearchPopupWindow(windowId);
    forgetSettingsPopupWindow(windowId);
    forgetTimerPopupWindow(windowId);
  });
}
