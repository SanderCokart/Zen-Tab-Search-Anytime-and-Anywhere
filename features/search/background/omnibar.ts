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
import { OMNIBAR_SHOWN_TYPE, type OmnibarView } from "@/shared/messaging/protocol";

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
export const OMNIBAR_PAGE = "/omnibar.html";

/** A newly built page reads its first view from the URL, since it misses the broadcast. */
function omnibarPageUrl(view?: OmnibarView): string {
  const url = browser.runtime.getURL(OMNIBAR_PAGE);
  return view ? `${url}?view=${encodeURIComponent(JSON.stringify(view))}` : url;
}

/** Builds the hidden window-hosted overlay so the first Alt+F is already warm. */
export async function preloadOmnibar(): Promise<void> {
  try {
    await preloadOmnibarOverlay(omnibarPageUrl());
  } catch (error) {
    debugLog(`${LOG_PREFIX} Omnibar overlay preload failed:`, formatError(error));
  }
}

let omnibarAnchorTabId: number | undefined;

/**
 * A tab in the window the window-hosted omnibar is showing in. Its page is not
 * a tab, so without this its requests anchor to the last focused window, which
 * is an open settings or timer popup and has no spaces to show.
 */
export function getOmnibarAnchorTabId(): number | undefined {
  return omnibarAnchorTabId;
}

export async function hideOmnibar(): Promise<void> {
  await hideOmnibarOverlay();
}

type OverlayToggle = Awaited<ReturnType<typeof toggleOmnibarOverlay>>;

/** Undefined when the experiment cannot host the omnibar, so callers fall back. */
async function toggleOverlay(view?: OmnibarView): Promise<OverlayToggle> {
  try {
    return await toggleOmnibarOverlay(omnibarPageUrl(view));
  } catch (error) {
    debugLog(`${LOG_PREFIX} Window omnibar unavailable:`, formatError(error));
    return undefined;
  }
}

async function showReadyOverlay(
  result: Extract<NonNullable<OverlayToggle>, { state: "ready" }>,
  view?: OmnibarView,
): Promise<void> {
  omnibarAnchorTabId = isUsableTabId(result.anchorTabId) ? result.anchorTabId : undefined;
  // The hidden page still shows the last search. Showing it before the
  // remount flashed old results, then the loading fade, then the new ones.
  const remounted = result.created || (await remountOmnibarPage(result.overlayId, view));
  await showOmnibarOverlay(result.overlayId);
  // A preloaded page still loading missed the broadcast; keep asking until it mounts.
  if (!remounted) void retryRemount(result.overlayId, view);
}

/**
 * Toggles the overlay the experiment hosts in the browser window. Returns false
 * when the experiment cannot, so the caller falls back to the in-page overlay.
 */
async function toggleWindowOmnibar(): Promise<boolean> {
  const result = await toggleOverlay();
  if (!result) return false;
  if (result.state === "ready") await showReadyOverlay(result);
  return true;
}

/**
 * Opens the window-hosted omnibar on a timer or host overrides view, so those
 * controls replace its columns instead of opening a window. Returns false when
 * the experiment cannot host it, so the caller opens the popup window instead.
 */
export async function openOmnibarView(view: OmnibarView): Promise<boolean> {
  let result = await toggleOverlay(view);
  // Already showing: that toggle hid it, so show it again on the new view.
  if (result?.state === "hidden") result = await toggleOverlay(view);
  if (result?.state !== "ready") return false;
  await showReadyOverlay(result, view);
  return true;
}

/** Longest wait for the page to remount before showing it anyway. */
const REMOUNT_TIMEOUT_MS = 250;
const REMOUNT_RETRIES = 20;

async function remountOmnibarPage(overlayId: string, view?: OmnibarView): Promise<boolean> {
  const remounted = browser.runtime
    .sendMessage({ type: OMNIBAR_SHOWN_TYPE, overlayId, view })
    .then((reply: unknown) => reply === true)
    .catch(() => false);
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), REMOUNT_TIMEOUT_MS),
  );
  return Promise.race([remounted, timeout]);
}

async function retryRemount(overlayId: string, view?: OmnibarView): Promise<void> {
  for (let attempt = 0; attempt < REMOUNT_RETRIES; attempt += 1) {
    // With no page listening yet, sendMessage rejects at once, so space the tries.
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await remountOmnibarPage(overlayId, view)) return;
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
