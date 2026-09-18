import { forgetSearchPopupWindow } from "@/lib/background/popups/search";
import { forgetSettingsPopupWindow } from "@/lib/background/popups/settings";
import { forgetTimerPopupWindow } from "@/lib/background/popups/timer";

export function registerPopupWindowTracking(): void {
  browser.windows.onRemoved.addListener((windowId) => {
    forgetSearchPopupWindow(windowId);
    forgetSettingsPopupWindow(windowId);
    forgetTimerPopupWindow(windowId);
  });
}
