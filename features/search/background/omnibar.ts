import { debugLog } from "@/shared/debug";
import { sendTabMessage } from "@/shared/messaging/client";
import { isUsableTabId } from "@/shared/types";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { isContentScriptInjectableUrl } from "@/shared/urls";
import { resolveAnchorTabId } from "@/features/zen/anchor";
import {
  hideOmnibarOverlay,
  preloadOmnibarOverlay,
  showOmnibarOverlay,
  toggleOmnibarOverlay,
} from "@/features/zen/omnibar-overlay";
import { readDisplaySettings } from "@/features/settings/model/display-settings";
import {
  OMNIBAR_HIDE_TYPE,
  OMNIBAR_SHOWN_TYPE,
  type OmnibarView,
} from "@/shared/messaging/protocol";

export interface ToggleOmnibarOptions {
  /** The command tab's URL, which saves a `tabs.get` when it is the anchor. */
  preferredUrl?: string;
  /**
   * Starts the snapshot read for the in-page fallback, so it runs while that
   * content script builds the overlay. The window-hosted page is already drawn.
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
async function toggleOverlay(view?: OmnibarView, deferHide?: boolean): Promise<OverlayToggle> {
  try {
    return await toggleOmnibarOverlay(omnibarPageUrl(view), deferHide);
  } catch (error) {
    debugLog(`${LOG_PREFIX} Window omnibar unavailable:`, formatError(error));
    return undefined;
  }
}

async function showReadyOverlay(
  result: Extract<NonNullable<OverlayToggle>, { state: "ready" }>,
  view?: OmnibarView,
  motion?: boolean,
): Promise<void> {
  omnibarAnchorTabId = isUsableTabId(result.anchorTabId) ? result.anchorTabId : undefined;
  const animated = motion ?? (await hasOpenMotion());
  // A page created for this show mounts itself from the URL.
  if (result.created) {
    await showOmnibarOverlay(result.overlayId);
    return;
  }
  // Motion has to start while the page is still hidden, or the first frame
  // is the finished deck and the animation plays after it.
  if (animated) await notifyOmnibarShown(result.overlayId, view);
  await showOmnibarOverlay(result.overlayId);
  if (!animated) void notifyOmnibarShown(result.overlayId, view);
}

async function hasOpenMotion(): Promise<boolean> {
  try {
    const settings = await readDisplaySettings();
    return settings.openTransition !== "none" && settings.openTransitionMs > 0;
  } catch {
    return false;
  }
}

async function deliverOmnibarHide(overlayId: string): Promise<boolean> {
  return browser.runtime
    .sendMessage({ type: OMNIBAR_HIDE_TYPE, overlayId })
    .then((reply: unknown) => reply === true)
    .catch(() => false);
}

/**
 * Toggles the overlay the experiment hosts in the browser window. Returns false
 * when the experiment cannot, so the caller falls back to the in-page overlay.
 */
async function toggleWindowOmnibar(): Promise<boolean> {
  const animated = await hasOpenMotion();
  // The page plays the close sound (or exit motion) before it hides itself.
  const result = await toggleOverlay(undefined, true);
  if (!result) return false;
  if (result.state === "shown") {
    if (!(await deliverOmnibarHide(result.overlayId))) {
      await hideOmnibarOverlay();
    }
    return true;
  }
  if (result.state === "ready") {
    await showReadyOverlay(result, undefined, animated);
  }
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

const SHOWN_RETRIES = 20;

async function deliverOmnibarShown(overlayId: string, view?: OmnibarView): Promise<boolean> {
  return browser.runtime
    .sendMessage({ type: OMNIBAR_SHOWN_TYPE, overlayId, view })
    .then((reply: unknown) => reply === true)
    .catch(() => false);
}

/** The preloaded page may still be loading on the first show. Ask until it answers. */
async function notifyOmnibarShown(overlayId: string, view?: OmnibarView): Promise<void> {
  if (await deliverOmnibarShown(overlayId, view)) return;
  for (let attempt = 0; attempt < SHOWN_RETRIES; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await deliverOmnibarShown(overlayId, view)) return;
  }
}

export async function toggleOmnibar(
  preferredTabId?: number,
  options: ToggleOmnibarOptions = {},
): Promise<void> {
  if (await toggleWindowOmnibar()) return;

  const tabId = await resolveAnchorTabId(preferredTabId);
  if (!isUsableTabId(tabId)) return;

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
      debugLog(`${LOG_PREFIX} In-page omnibar unavailable:`, formatError(error));
    }
  }
}
