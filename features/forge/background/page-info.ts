import { debugLog } from "@/shared/debug";
import type { ForgePageInfo } from "@/features/forge/model/forge-label";
import { sendTabMessage } from "@/shared/messaging/client";
import { isUsableTabId } from "@/shared/types";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { isContentScriptInjectableUrl } from "@/shared/urls";

/** Asks a tab's content script what its forge page shows; empty when it cannot answer. */
export async function getForgePageInfo(tabId?: number, url?: string): Promise<ForgePageInfo> {
  if (!isUsableTabId(tabId) || !isContentScriptInjectableUrl(url)) {
    return {};
  }

  try {
    return await sendTabMessage(tabId, { type: "getForgePageInfo" });
  } catch (error) {
    debugLog(`${LOG_PREFIX} getForgePageInfo unavailable:`, formatError(error));
  }

  return {};
}
