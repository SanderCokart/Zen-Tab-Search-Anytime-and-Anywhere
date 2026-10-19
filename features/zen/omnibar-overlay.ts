import { getZenTabsApi, type OmnibarOverlayToggle } from "@/features/zen/api";

/**
 * The omnibar hosted in the browser window by the `zenTabs` experiment, so it
 * needs no page DOM. Each call returns undefined when the experiment lacks it.
 */
export async function toggleOmnibarOverlay(
  pageUrl: string,
): Promise<OmnibarOverlayToggle | undefined> {
  return getZenTabsApi()?.toggleOmnibarOverlay?.(pageUrl);
}

export async function showOmnibarOverlay(overlayId: string): Promise<boolean> {
  return (await getZenTabsApi()?.showOmnibarOverlay?.(overlayId)) ?? false;
}

export async function preloadOmnibarOverlay(pageUrl: string): Promise<boolean> {
  return (await getZenTabsApi()?.preloadOmnibarOverlay?.(pageUrl)) ?? false;
}

export async function hideOmnibarOverlay(): Promise<boolean> {
  return (await getZenTabsApi()?.hideOmnibarOverlay?.()) ?? false;
}
