import { useState } from "preact/hooks";
import { ESSENTIAL_TAB_NAMES_KEY } from "@/features/search/ui/hooks/useEssentialTabNames";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import { isEssentialTab, tabBrowserId, type TabInfo } from "@/shared/types";

export interface UseTabRenameOptions {
  essentialNames: Record<string, string>;
  setEssentialNames: (names: Record<string, string>) => void;
  setTabs: (update: (current: TabInfo[]) => TabInfo[]) => void;
}

const RENAME_FAILED = "Could not rename this tab.";
const NOT_RENAMEABLE = "This tab cannot be renamed.";

/**
 * Rename-dialog state plus the two ways a rename is persisted: essential tabs
 * keep an extension-local name, ordinary tabs get a Zen custom label.
 */
export function useTabRename({ essentialNames, setEssentialNames, setTabs }: UseTabRenameOptions) {
  const [dialog, setDialog] = useState<{ tab: TabInfo; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (tab: TabInfo, value: string) => {
    setError(null);
    setDialog({ tab, value });
  };
  const close = () => setDialog(null);
  const setValue = (value: string) =>
    setDialog((current) => (current ? { ...current, value } : current));

  const submit = (name: string) => {
    if (!dialog) return;
    const { tab } = dialog;

    if (isEssentialTab(tab)) {
      const domId = tab.domId;
      if (!domId) {
        setError(NOT_RENAMEABLE);
        return;
      }
      const nextNames = { ...essentialNames };
      if (name) {
        nextNames[domId] = name;
      } else {
        delete nextNames[domId];
      }
      void browser.storage.local
        .set({ [ESSENTIAL_TAB_NAMES_KEY]: nextNames })
        .then(() => {
          setEssentialNames(nextNames);
          setDialog(null);
        })
        .catch((cause) => {
          debugError("Could not save essential tab name:", cause);
          setError(RENAME_FAILED);
        });
      return;
    }

    const tabId = tabBrowserId(tab);
    if (tabId === undefined) {
      setError(NOT_RENAMEABLE);
      return;
    }
    void sendExtensionMessage({ type: "setTabLabel", tabId, label: name })
      .then(() => {
        setTabs((current) =>
          current.map((item) =>
            tabBrowserId(item) === tabId ? { ...item, customLabel: name } : item,
          ),
        );
        setDialog(null);
      })
      .catch((cause) => {
        debugError("Could not rename tab:", cause);
        setError(RENAME_FAILED);
      });
  };

  return { dialog, error, open, close, setValue, submit };
}
