import { debugWarn } from "../../debug";
import { isUsableTabId } from "../../types";
import { formatError, LOG_PREFIX } from "../log";

let fallbackPopupWindowId: number | undefined;

export function forgetSearchPopupWindow(windowId: number): void {
  if (windowId === fallbackPopupWindowId) {
    fallbackPopupWindowId = undefined;
  }
}

export async function closeSearchPopup(): Promise<boolean> {
  let closed = false;

  for (const view of browser.extension.getViews({ type: "popup" })) {
    (view as unknown as { close(): void }).close();
    closed = true;
  }

  if (isUsableTabId(fallbackPopupWindowId)) {
    try {
      await browser.windows.remove(fallbackPopupWindowId);
      closed = true;
    } catch {
      // Window was already closed.
    }
    fallbackPopupWindowId = undefined;
  }

  return closed;
}

export async function openSearchPopup(): Promise<void> {
  try {
    const browserAction = browser.browserAction as typeof browser.browserAction & {
      openPopup?: () => Promise<void>;
    };
    if (!browserAction.openPopup) {
      throw new Error("browserAction.openPopup unavailable");
    }
    await browserAction.openPopup();
    return;
  } catch (error) {
    debugWarn(
      `${LOG_PREFIX} browserAction.openPopup failed, trying popup window:`,
      formatError(error),
    );
  }

  try {
    const popupWindow = await browser.windows.create({
      url: browser.runtime.getURL("/popup.html"),
      type: "popup",
      width: 400,
      height: 480,
    });
    const popupWindowId = popupWindow?.id;
    if (isUsableTabId(popupWindowId)) {
      fallbackPopupWindowId = popupWindowId;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not open search popup:`, formatError(error));
  }
}

export async function toggleSearchPopup(): Promise<void> {
  if (await closeSearchPopup()) {
    return;
  }

  await openSearchPopup();
}
