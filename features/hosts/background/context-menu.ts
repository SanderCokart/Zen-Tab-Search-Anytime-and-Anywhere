import { errorMessage, formatError, LOG_PREFIX } from "@/shared/log";
import { TAB_CONTEXT } from "@/shared/context-menus";
import { isUsableTabId } from "@/shared/types";
import { describeHostOverride } from "@/features/hosts/model/host-override";
import { openHostOverridesPopup } from "@/features/hosts/background/popup";
import {
  showNotification,
  type HostOverrideService,
} from "@/features/hosts/background/host-override-service";

/**
 * The tab strip plus every page context (page, link, selection, image, …).
 * Firefox's "all" leaves out the tab strip, so it is listed too.
 */
const MENU_CONTEXTS: [typeof TAB_CONTEXT, ...(typeof TAB_CONTEXT)[]] = [TAB_CONTEXT, "all"];

const PARENT_ID = "tab-hosts";
const MANAGE_ID = "tab-hosts-manage";
const DISABLE_ALL_ID = "tab-hosts-disable-all";
const TOGGLE_PREFIX = "tab-hosts-toggle:";
const GLOBAL_TOGGLE_PREFIX = "tab-hosts-toggle-global:";
/** Toggle ID prefix to the list it toggles in. The global prefix is checked first. */
const TOGGLE_SCOPES = [
  [GLOBAL_TOGGLE_PREFIX, "global"],
  [TOGGLE_PREFIX, "tab"],
] as const;

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
 * Adds the host override submenu to the tab context menu and every page context
 * menu. Called from inside the shared `removeAll` reset in
 * `app/background/context-menus.ts`. A toggle per IP group is filled in for the
 * clicked tab (or the tab of the clicked page) when the menu opens.
 */
export function createHostOverrideContextMenuItems(): void {
  browser.contextMenus.create({
    id: PARENT_ID,
    title: "Host overrides",
    contexts: MENU_CONTEXTS,
  });
  browser.contextMenus.create({
    id: MANAGE_ID,
    parentId: PARENT_ID,
    title: "Manage host overrides…",
    contexts: MENU_CONTEXTS,
  });
  browser.contextMenus.create({
    id: DISABLE_ALL_ID,
    parentId: PARENT_ID,
    title: "Turn all off",
    contexts: MENU_CONTEXTS,
  });
  browser.contextMenus.create({
    id: "tab-hosts-separator",
    parentId: PARENT_ID,
    type: "separator",
    contexts: MENU_CONTEXTS,
  });
}

function reportError(action: string, error: unknown): void {
  console.error(`${LOG_PREFIX} Could not ${action}:`, formatError(error));
  void showNotification("", "Host overrides", errorMessage(error, `Could not ${action}.`)).catch(
    () => undefined,
  );
}

/** Handles a host override menu click. Returns false when the click was for another menu. */
export function handleHostOverrideContextMenuClick(
  menuItemId: string | number,
  checked: boolean | undefined,
  tabId: number,
  service: HostOverrideService,
  onChanged: () => void,
): boolean {
  const id = String(menuItemId);
  if (id === MANAGE_ID) {
    void openHostOverridesPopup(tabId);
    return true;
  }
  if (id === DISABLE_ALL_ID) {
    service
      .disableAll(tabId)
      .then(onChanged)
      .catch((error) => reportError("turn off host overrides", error));
    return true;
  }
  for (const [prefix, scope] of TOGGLE_SCOPES) {
    if (id.startsWith(prefix)) {
      service
        .setEnabled(scope, tabId, id.slice(prefix.length), checked === true)
        .then(onChanged)
        .catch((error) => reportError("toggle the host override", error));
      return true;
    }
  }
  return false;
}

/**
 * Rebuilds the per-group toggles each time a menu showing them opens, so they
 * show the groups and on/off state of the tab that was right-clicked (or whose
 * page was), followed by the global groups every tab uses.
 */
export function registerHostOverrideMenuRefresh(service: HostOverrideService): void {
  const menus = browser.contextMenus as typeof browser.contextMenus & MenusWithShown;
  if (!menus.onShown) {
    return;
  }

  let toggleIds: string[] = [];
  let showCount = 0;

  menus.onShown.addListener((info, tab) => {
    if (!info.menuIds.includes(PARENT_ID) || !isUsableTabId(tab?.id)) {
      return;
    }
    const tabId = tab.id;
    const shown = ++showCount;

    void Promise.all([service.getOverrides(tabId), service.getGlobalOverrides()])
      .then(async ([groups, globalGroups]) => {
        if (shown !== showCount) {
          return;
        }
        await Promise.all(
          toggleIds.map((id) => browser.contextMenus.remove(id).catch(() => undefined)),
        );
        const toggles = [
          ...groups.map((group) => ({ group, prefix: TOGGLE_PREFIX, suffix: "" })),
          ...globalGroups.map((group) => ({
            group,
            prefix: GLOBAL_TOGGLE_PREFIX,
            suffix: " · all tabs",
          })),
        ];
        toggleIds = toggles.map(({ group, prefix }) => `${prefix}${group.id}`);
        for (const { group, prefix, suffix } of toggles) {
          browser.contextMenus.create({
            id: `${prefix}${group.id}`,
            parentId: PARENT_ID,
            type: "checkbox",
            checked: group.enabled,
            title: `${describeHostOverride(group)} (${group.ip})${suffix}`,
            contexts: MENU_CONTEXTS,
          });
        }
        const enabledCount = toggles.filter(({ group }) => group.enabled).length;
        await Promise.all([
          browser.contextMenus.update(PARENT_ID, {
            title: enabledCount > 0 ? `Host overrides (${enabledCount} on)` : "Host overrides",
          }),
          browser.contextMenus.update(DISABLE_ALL_ID, { enabled: enabledCount > 0 }),
        ]);
        await menus.refresh?.();
      })
      .catch((error) => {
        console.error(
          `${LOG_PREFIX} Could not refresh the host override menu:`,
          formatError(error),
        );
      });
  });
}
