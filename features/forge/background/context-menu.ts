import { formatError, LOG_PREFIX } from "@/shared/log";
import { TAB_CONTEXT } from "@/shared/context-menus";
import { isUsableTabId } from "@/shared/types";
import type { ForgeOrganizeMode } from "@/features/forge/model/forge-tab-organize";

const PARENT_ID = "tab-organize-forge";
const TREE_ID = "tab-organize-forge-tree";
const BY_ISSUE_ID = "tab-organize-forge-by-issue";

const MODE_BY_MENU_ID: Record<string, ForgeOrganizeMode> = {
  [TREE_ID]: "tree",
  [BY_ISSUE_ID]: "byIssue",
};

/** Firefox's `menus.onShown`, which Chrome's typings do not know about. */
interface MenusWithShown {
  onShown?: {
    addListener(
      listener: (info: { menuIds: (string | number)[] }, tab?: { id?: number }) => void,
    ): void;
  };
  refresh?(): Promise<void>;
}

/**
 * Adds the organize submenu to the tab-strip context menu. Called from inside
 * the shared `removeAll` reset in `app/background/context-menus.ts`.
 */
export function createForgeOrganizeContextMenuItems(): void {
  browser.contextMenus.create({
    id: PARENT_ID,
    title: "Organize in this folder",
    contexts: [TAB_CONTEXT],
  });
  browser.contextMenus.create({
    id: TREE_ID,
    parentId: PARENT_ID,
    title: "As in this list",
    contexts: [TAB_CONTEXT],
  });
  browser.contextMenus.create({
    id: BY_ISSUE_ID,
    parentId: PARENT_ID,
    title: "Group with issues",
    contexts: [TAB_CONTEXT],
  });
}

export function forgeOrganizeModeFromMenuId(
  menuItemId: string | number,
): ForgeOrganizeMode | undefined {
  return MODE_BY_MENU_ID[String(menuItemId)];
}

/** Handles an organize menu click. Returns false when the click was for another menu. */
export function handleForgeOrganizeContextMenuClick(
  menuItemId: string | number,
  tabId: number,
  organize: (tabId: number, mode: ForgeOrganizeMode) => Promise<unknown>,
  onChanged: () => void,
): boolean {
  const mode = forgeOrganizeModeFromMenuId(menuItemId);
  if (!mode) {
    return false;
  }
  void organize(tabId, mode)
    .then(onChanged)
    .catch((error) => {
      console.error(
        `${LOG_PREFIX} Could not organize tabs from the tab menu:`,
        formatError(error),
      );
    });
  return true;
}

/**
 * Greys the submenu out unless the right-clicked tab sits in a folder, because
 * the action only rearranges that folder.
 */
export function registerForgeOrganizeMenuRefresh(
  getFolderId: (tabId: number) => Promise<string | undefined>,
): void {
  const menus = browser.contextMenus as typeof browser.contextMenus & MenusWithShown;
  if (!menus.onShown) {
    return;
  }

  menus.onShown.addListener((info, tab) => {
    if (!info.menuIds.includes(PARENT_ID) || !isUsableTabId(tab?.id)) {
      return;
    }
    const tabId = tab.id;
    void getFolderId(tabId)
      .then(async (folderId) => {
        const enabled = Boolean(folderId);
        await Promise.all(
          [PARENT_ID, TREE_ID, BY_ISSUE_ID].map((id) =>
            browser.contextMenus.update(id, { enabled }),
          ),
        );
        await menus.refresh?.();
      })
      .catch((error) => {
        console.error(
          `${LOG_PREFIX} Could not refresh the organize tab menu:`,
          formatError(error),
        );
      });
  });
}
