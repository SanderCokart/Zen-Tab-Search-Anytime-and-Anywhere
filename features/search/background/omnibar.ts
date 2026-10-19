import { debugLog } from "@/shared/debug";
import { sendTabMessage } from "@/shared/messaging/client";
import { isUsableTabId } from "@/shared/types";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { toggleSearchPopup } from "@/features/search/background/popup";
import { isContentScriptInjectableUrl } from "@/shared/urls";
import { resolveAnchorTabId } from "@/features/zen/anchor";
import {
  hideOmnibarOverlay,
  preloadOmnibarOverlay,
  showOmnibarOverlay,
  toggleOmnibarOverlay,
} from "@/features/zen/omnibar-overlay";
import { OMNIBAR_SHOWN_TYPE } from "@/shared/messaging/protocol";

export interface ToggleOmnibarOptions {
  /** The command tab's URL, which saves a `tabs.get` when it is the anchor. */
  preferredUrl?: string;
  /**
   * Starts the snapshot read for the anchor tab, so it runs while the content
   * script builds the overlay instead of after the overlay asks for it.
   */
  warmSnapshot?: (anchorTabId: number) => void;
}

/** The search page the window-hosted overlay loads. */
const OMNIBAR_PAGE = "/omnibar.html";

function omnibarPageUrl(): string {
  return browser.runtime.getURL(OMNIBAR_PAGE);
}

/** Builds the hidden window-hosted overlay so the first Alt+F is already warm. */
export async function preloadOmnibar(): Promise<void> {
  try {
    await preloadOmnibarOverlay(omnibarPageUrl());
  } catch (error) {
    debugLog(`${LOG_PREFIX} Omnibar overlay preload failed:`, formatError(error));
  }
}

export async function hideOmnibar(): Promise<void> {
  await hideOmnibarOverlay();
}

/**
 * Toggles the overlay the experiment hosts in the browser window. Returns false
 * when the experiment cannot, so the caller falls back to the in-page overlay.
 */
async function toggleWindowOmnibar(): Promise<boolean> {
  let result;
  try {
    result = await toggleOmnibarOverlay(omnibarPageUrl());
  } catch (error) {
    debugLog(`${LOG_PREFIX} Window omnibar unavailable:`, formatError(error));
    return false;
  }
  if (!result) return false;
  if (result.state === "ready") {
    // The hidden page still shows the last search. Showing it before the
    // remount flashed old results, then the loading fade, then the new ones.
    const remounted = result.created || (await remountOmnibarPage(result.overlayId));
    await showOmnibarOverlay(result.overlayId);
    // A preloaded page still loading missed the broadcast; keep asking until it mounts.
    if (!remounted) void retryRemount(result.overlayId);
  }
  return true;
}

/** Longest wait for the page to remount before showing it anyway. */
const REMOUNT_TIMEOUT_MS = 250;
const REMOUNT_RETRIES = 20;

async function remountOmnibarPage(overlayId: string): Promise<boolean> {
  const remounted = browser.runtime
    .sendMessage({ type: OMNIBAR_SHOWN_TYPE, overlayId })
    .then((reply: unknown) => reply === true)
    .catch(() => false);
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), REMOUNT_TIMEOUT_MS),
  );
  return Promise.race([remounted, timeout]);
}

async function retryRemount(overlayId: string): Promise<void> {
  for (let attempt = 0; attempt < REMOUNT_RETRIES; attempt += 1) {
    // With no page listening yet, sendMessage rejects at once, so space the tries.
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await remountOmnibarPage(overlayId)) return;
  }
}

export async function toggleOmnibar(
  preferredTabId?: number,
  options: ToggleOmnibarOptions = {},
): Promise<void> {
  if (await toggleWindowOmnibar()) return;

  const tabId = await resolveAnchorTabId(preferredTabId);
  if (!isUsableTabId(tabId)) {
    await toggleSearchPopup();
    return;
  }

  let url: string | undefined;
  if (tabId === preferredTabId && options.preferredUrl !== undefined) {
    url = options.preferredUrl;
  } else {
    try {
      url = (await browser.tabs.get(tabId)).url;
    } catch {
      url = undefined;
    }
  }

  if (isContentScriptInjectableUrl(url)) {
    options.warmSnapshot?.(tabId);
    try {
      await sendTabMessage(tabId, { type: "toggleOmnibar", anchorTabId: tabId });
      return;
    } catch (error) {
      debugLog(
        `${LOG_PREFIX} In-page omnibar unavailable, falling back to popup:`,
        formatError(error),
      );
    }
  }

  await toggleSearchPopup();
}
