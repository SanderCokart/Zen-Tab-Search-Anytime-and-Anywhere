import { forgetSearchPopupWindow } from "@/features/search/background/popup";
import { forgetSettingsPopupWindow } from "@/features/settings/background/popup";
import { forgetTimerPopupWindow } from "@/features/timers/background/popup";

export function registerPopupWindowTracking(): void {
  browser.windows.onRemoved.addListener((windowId) => {
    forgetSearchPopupWindow(windowId);
    forgetSettingsPopupWindow(windowId);
    forgetTimerPopupWindow(windowId);
  });
}
