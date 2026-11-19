import type { createTimerService } from "@/features/timers/background/timer-service";
import {
  createTimerContextMenuItems,
  handleTimerContextMenuClick,
} from "@/features/timers/background/context-menu";
import {
  createTodoContextMenuItems,
  handleTodoContextMenuClick,
} from "@/features/todos/background/context-menu";
import type { TodoService } from "@/features/todos/background/todo-service";
import {
  createHostOverrideContextMenuItems,
  handleHostOverrideContextMenuClick,
  registerHostOverrideMenuRefresh,
} from "@/features/hosts/background/context-menu";
import type { HostOverrideService } from "@/features/hosts/background/host-override-service";
import {
  createForgeOrganizeContextMenuItems,
  handleForgeOrganizeContextMenuClick,
  registerForgeOrganizeMenuRefresh,
} from "@/features/forge/background/context-menu";
import type { ForgeOrganizeMode } from "@/features/forge/model/forge-tab-organize";
import { isUsableTabId } from "@/shared/types";

export interface ContextMenuServices {
  timers: ReturnType<typeof createTimerService>;
  todos: TodoService;
  hosts: HostOverrideService;
  organizeForgeTabs(tabId: number, mode: ForgeOrganizeMode): Promise<unknown>;
  getTabFolderId(tabId: number): Promise<string | undefined>;
  /** Called after a menu click changed what the search UI shows. */
  onChanged(): void;
}

/** Registers every tab context-menu entry in one `removeAll` pass, so no feature wipes another's. */
export function registerContextMenus({
  timers,
  todos,
  hosts,
  organizeForgeTabs,
  getTabFolderId,
  onChanged,
}: ContextMenuServices): void {
  void browser.contextMenus.removeAll().then(() => {
    createTodoContextMenuItems();
    createTimerContextMenuItems();
    createHostOverrideContextMenuItems();
    createForgeOrganizeContextMenuItems();
  });
  registerHostOverrideMenuRefresh(hosts);
  registerForgeOrganizeMenuRefresh(getTabFolderId);

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const tabId = tab?.id;
    if (!isUsableTabId(tabId)) {
      return;
    }
    if (handleTodoContextMenuClick(info.menuItemId, tabId, todos, onChanged)) {
      return;
    }
    if (handleTimerContextMenuClick(info.menuItemId, tabId, timers)) {
      return;
    }
    if (handleForgeOrganizeContextMenuClick(info.menuItemId, tabId, organizeForgeTabs, onChanged)) {
      return;
    }
    handleHostOverrideContextMenuClick(info.menuItemId, info.checked, tabId, hosts, onChanged);
  });
}
