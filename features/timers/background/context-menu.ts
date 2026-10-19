import { formatError, LOG_PREFIX } from "@/shared/log";
import { TAB_CONTEXT } from "@/shared/context-menus";
import { openCustomTimerPopup } from "@/features/timers/background/popup";
import type { createTimerService } from "@/features/timers/background/timer-service";

type TimerService = ReturnType<typeof createTimerService>;

/**
 * Adds the timer submenu to the tab context menu. Called from inside the shared
 * `removeAll` reset in `app/background/context-menus.ts`.
 */
export function createTimerContextMenuItems(): void {
  browser.contextMenus.create({
    id: "tab-timer",
    title: "Tab timer",
    contexts: [TAB_CONTEXT],
  });
  for (const [id, title] of [
    ["tab-timer-30-minutes", "30 minutes"],
    ["tab-timer-1-hour", "1 hour"],
    ["tab-timer-7-hours", "7 hours"],
    ["tab-timer-8-hours", "8 hours"],
  ]) {
    browser.contextMenus.create({
      id,
      parentId: "tab-timer",
      title,
      contexts: [TAB_CONTEXT],
    });
  }
  browser.contextMenus.create({
    id: "tab-timer-custom",
    parentId: "tab-timer",
    title: "Custom…",
    contexts: [TAB_CONTEXT],
  });
  browser.contextMenus.create({
    id: "tab-timer-clear",
    parentId: "tab-timer",
    title: "Clear timer",
    contexts: [TAB_CONTEXT],
  });
}

/** Handles a timer menu click. Returns false when the click was for another menu. */
export function handleTimerContextMenuClick(
  menuItemId: string | number,
  tabId: number,
  timerService: TimerService,
): boolean {
  if (menuItemId === "tab-timer-clear") {
    void timerService.clearTabTimer(tabId).catch((error) => {
      console.error(`${LOG_PREFIX} Could not clear context-menu timer:`, formatError(error));
    });
    return true;
  }

  const endAtByMenuId: Record<string, number> = {
    "tab-timer-30-minutes": Date.now() + 30 * 60_000,
    "tab-timer-1-hour": Date.now() + 60 * 60_000,
    "tab-timer-7-hours": Date.now() + 7 * 60 * 60_000,
    "tab-timer-8-hours": Date.now() + 8 * 60 * 60_000,
  };
  const endAt = endAtByMenuId[String(menuItemId)];
  if (endAt) {
    void timerService.setTabTimer(tabId, endAt).catch((error) => {
      console.error(`${LOG_PREFIX} Could not set context-menu timer:`, formatError(error));
    });
    return true;
  }

  if (menuItemId === "tab-timer-custom") {
    void openCustomTimerPopup(tabId);
    return true;
  }
  return false;
}
