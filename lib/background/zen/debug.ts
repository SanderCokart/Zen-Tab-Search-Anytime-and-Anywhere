import { DEBUG, debugError, debugLog, debugWarn } from "../../debug";
import { formatError, LOG_PREFIX } from "../log";
import { getZenTabsApi } from "./api";
import { resolveAnchorTabId } from "./anchor";

export async function logZenDebugInfo(context: string, anchorTabId?: number): Promise<void> {
  if (!DEBUG) {
    return;
  }

  const zenTabs = getZenTabsApi();
  if (!zenTabs?.getDebugInfo) {
    debugWarn(`${LOG_PREFIX} ${context}: zenTabs.getDebugInfo unavailable`);
    return;
  }

  const tabId = await resolveAnchorTabId(anchorTabId);
  try {
    const info = await zenTabs.getDebugInfo(tabId);
    debugWarn(`${LOG_PREFIX} ${context} debug info:`, info);
  } catch (error) {
    debugWarn(`${LOG_PREFIX} ${context}: getDebugInfo failed:`, formatError(error));
  }
}

export async function warmUpZenTabsApi(): Promise<void> {
  if (!DEBUG) {
    return;
  }

  const zenTabs = getZenTabsApi();
  if (!zenTabs) {
    debugWarn(
      `${LOG_PREFIX} warmUp: browser.zenTabs unavailable — Zen Browser experiment API required`,
    );
    debugWarn(
      `${LOG_PREFIX} Set extensions.experiments.enabled=true in about:config and restart Zen`,
    );
    return;
  }

  const anchorTabId = await resolveAnchorTabId();
  debugLog(`${LOG_PREFIX} warmUp: zenTabs available`, {
    methods: Object.keys(zenTabs),
    anchorTabId,
  });

  if (!Number.isInteger(anchorTabId)) {
    debugWarn(`${LOG_PREFIX} warmUp: no active tab yet — Zen APIs need an open browser tab`);
    return;
  }

  try {
    const info = await zenTabs.getDebugInfo(anchorTabId);
    debugLog(`${LOG_PREFIX} warmUp debug info:`, info);
  } catch (error) {
    debugError(`${LOG_PREFIX} warmUp getDebugInfo failed:`, formatError(error));
  }

  try {
    const spaces = await zenTabs.getSpaces(anchorTabId);
    debugLog(`${LOG_PREFIX} warmUp getSpaces:`, { count: spaces.length, spaces });
  } catch (error) {
    debugError(`${LOG_PREFIX} warmUp getSpaces failed:`, formatError(error));
    await logZenDebugInfo("warmUp getSpaces", anchorTabId);
  }
}

export async function getZenDebugInfoPayload(anchorTabId?: number): Promise<unknown> {
  const tabId = await resolveAnchorTabId(anchorTabId);
  return (await getZenTabsApi()?.getDebugInfo(tabId)) ?? { error: "zenTabs API unavailable" };
}
