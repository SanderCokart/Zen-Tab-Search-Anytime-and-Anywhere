import { debugLog } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { openCustomTimerPopup } from "@/features/timers/background/popup";
import type { WorkspaceAdapter } from "@/features/zen/adapter";
import { isUsableBrowserTabId } from "@/features/zen/anchor";
import { changeSelectedTabLabel } from "@/features/forge/background/label-command";
import { toggleOmnibar } from "@/features/search/background/omnibar";

interface OmnibarOptions {
  warmSnapshot?: (anchorTabId: number) => void;
}

/** Toggles the omnibar for the tab the user acted in: the shortcut or the toolbar button. */
function toggleOmnibarFromTab(
  tab: { id?: number; url?: string } | undefined,
  options: OmnibarOptions,
): void {
  const commandTabId = isUsableBrowserTabId(tab?.id, tab?.url) ? tab?.id : undefined;
  void toggleOmnibar(commandTabId, {
    preferredUrl: commandTabId === undefined ? undefined : tab?.url,
    warmSnapshot: options.warmSnapshot,
  }).catch((error) => {
    console.error(`${LOG_PREFIX} Error toggling the omnibar:`, formatError(error));
  });
}

export function registerCommands(
  workspace: WorkspaceAdapter,
  options: OmnibarOptions = {},
): void {
  // The toolbar button has no popup, so clicking it opens the omnibar.
  browser.browserAction.onClicked.addListener((tab) => {
    debugLog(`${LOG_PREFIX} toolbar button clicked`, { tabId: tab.id, url: tab.url });
    toggleOmnibarFromTab(tab, options);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    const commandTabId = isUsableBrowserTabId(tab?.id, tab?.url) ? tab?.id : undefined;
    debugLog(`${LOG_PREFIX} command ${command}`, {
      tabId: tab?.id,
      url: tab?.url,
      commandTabId,
    });

    if (command === "show-omnibar") {
      toggleOmnibarFromTab(tab, options);
      return;
    }

    if (command === "change-tab-label") {
      void changeSelectedTabLabel(workspace, commandTabId).catch((error) => {
        console.error(`${LOG_PREFIX} Error handling change-tab-label command:`, formatError(error));
      });
      return;
    }

    if (command === "set-tab-timer") {
      void workspace
        .resolveAnchorTabId(commandTabId)
        .then((tabId) => {
          if (!Number.isInteger(tabId) || tabId! < 0) {
            throw new Error("No current tab to set a timer on");
          }
          return openCustomTimerPopup(tabId!);
        })
        .catch((error) => {
          console.error(`${LOG_PREFIX} Error handling set-tab-timer command:`, formatError(error));
        });
    }
  });
}
