import { formatError, LOG_PREFIX } from "../log";
import { openCustomTimerPopup } from "../popups/timer";
import { toggleSearchPopup } from "../popups/search";
import type { WorkspaceAdapter } from "../zen/adapter";
import { changeSelectedTabLabel } from "./label";
import { toggleOmnibar } from "./omnibar";

export function registerCommands(workspace: WorkspaceAdapter): void {
  browser.commands.onCommand.addListener((command) => {
    if (command === "show-omnibar") {
      void toggleOmnibar().catch((error) => {
        console.error(`${LOG_PREFIX} Error handling show-omnibar command:`, formatError(error));
      });
      return;
    }

    if (command === "toggle-popup") {
      void toggleSearchPopup().catch((error) => {
        console.error(`${LOG_PREFIX} Error handling toggle-popup command:`, formatError(error));
      });
      return;
    }

    if (command === "change-tab-label") {
      void changeSelectedTabLabel(workspace).catch((error) => {
        console.error(`${LOG_PREFIX} Error handling change-tab-label command:`, formatError(error));
      });
      return;
    }

    if (command === "set-tab-timer") {
      void workspace
        .resolveAnchorTabId()
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
