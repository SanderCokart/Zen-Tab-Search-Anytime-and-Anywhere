import { formatError, LOG_PREFIX } from "../log";
import { openCustomTimerPopup } from "../popups/timer";
import type { createTimerService } from "../timer-service";
import { isUsableTabId } from "../../types";

type TimerService = ReturnType<typeof createTimerService>;

type ContextMenuContext = NonNullable<
  Parameters<typeof browser.contextMenus.create>[0]["contexts"]
>[number];
const TAB_CONTEXT = "tab" as unknown as ContextMenuContext;

export function registerTimerContextMenus(timerService: TimerService): void {
  void browser.contextMenus.removeAll().then(() => {
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
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const tabId = tab?.id;
    if (!isUsableTabId(tabId)) {
      return;
    }

    if (info.menuItemId === "tab-timer-clear") {
      void timerService.clearTabTimer(tabId).catch((error) => {
        console.error(`${LOG_PREFIX} Could not clear context-menu timer:`, formatError(error));
      });
      return;
    }

    const endAtByMenuId: Record<string, number> = {
      "tab-timer-30-minutes": Date.now() + 30 * 60_000,
      "tab-timer-1-hour": Date.now() + 60 * 60_000,
      "tab-timer-7-hours": Date.now() + 7 * 60 * 60_000,
      "tab-timer-8-hours": Date.now() + 8 * 60 * 60_000,
    };
    const endAt = endAtByMenuId[String(info.menuItemId)];
    if (endAt) {
      void timerService.setTabTimer(tabId, endAt).catch((error) => {
        console.error(`${LOG_PREFIX} Could not set context-menu timer:`, formatError(error));
      });
      return;
    }

    if (info.menuItemId === "tab-timer-custom") {
      void openCustomTimerPopup(tabId);
    }
  });
}
