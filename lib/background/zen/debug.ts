import { DEBUG, debugError, debugLog, debugWarn } from "../../debug";
import { formatError, LOG_PREFIX } from "../log";
import type { WorkspaceAdapter } from "./adapter";

export async function logZenDebugInfo(
  workspace: WorkspaceAdapter,
  context: string,
  anchorTabId?: number,
): Promise<void> {
  if (!DEBUG) {
    return;
  }

  if (!workspace.isAvailable()) {
    debugWarn(`${LOG_PREFIX} ${context}: zenTabs.getDebugInfo unavailable`);
    return;
  }

  try {
    const info = await workspace.getDebugInfo(anchorTabId);
    debugWarn(`${LOG_PREFIX} ${context} debug info:`, info);
  } catch (error) {
    debugWarn(`${LOG_PREFIX} ${context}: getDebugInfo failed:`, formatError(error));
  }
}

export async function warmUpZenTabsApi(workspace: WorkspaceAdapter): Promise<void> {
  if (!DEBUG) {
    return;
  }

  if (!workspace.isAvailable()) {
    debugWarn(
      `${LOG_PREFIX} warmUp: browser.zenTabs unavailable — Zen Browser experiment API required`,
    );
    debugWarn(
      `${LOG_PREFIX} Set extensions.experiments.enabled=true in about:config and restart Zen`,
    );
    return;
  }

  const anchorTabId = await workspace.resolveAnchorTabId();
  debugLog(`${LOG_PREFIX} warmUp: zenTabs available`, {
    methods: workspace.apiMethodNames(),
    anchorTabId,
  });

  if (!Number.isInteger(anchorTabId)) {
    debugWarn(`${LOG_PREFIX} warmUp: no active tab yet — Zen APIs need an open browser tab`);
    return;
  }

  try {
    const info = await workspace.getDebugInfo(anchorTabId);
    debugLog(`${LOG_PREFIX} warmUp debug info:`, info);
  } catch (error) {
    debugError(`${LOG_PREFIX} warmUp getDebugInfo failed:`, formatError(error));
  }

  try {
    const spaces = await workspace.listSpaces(anchorTabId);
    debugLog(`${LOG_PREFIX} warmUp getSpaces:`, { count: spaces.length, spaces });
  } catch (error) {
    debugError(`${LOG_PREFIX} warmUp getSpaces failed:`, formatError(error));
    await logZenDebugInfo(workspace, "warmUp getSpaces", anchorTabId);
  }
}
