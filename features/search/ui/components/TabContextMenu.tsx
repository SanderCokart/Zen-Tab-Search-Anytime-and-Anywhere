import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useClampedPosition } from "@/features/search/ui/hooks/useClampedPosition";
import { TimerIcon } from "@/features/search/ui/components/TimerIcon";
import { folderMenuLabel, foldersForMenu } from "@/features/search/model/folder-menu";
import { TodoIcon } from "@/features/todos/ui/TodoIcon";
import { TRAFFIC_LIGHT_OPTIONS } from "@/features/status/model/status";
import { trafficLightDotClass } from "@/features/status/ui/traffic-light";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { OverlayFolderInfo } from "@/shared/messaging/protocol";
import {
  canRenameTab,
  isEssentialTab,
  isPinnedTab,
  tabBrowserId,
  type TabInfo,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export interface TabContextMenuProps {
  tab: TabInfo;
  x: number;
  y: number;
  isTodo: boolean;
  /** The tab's status color, if it has one. */
  light?: TrafficLight;
  onRename: () => void;
  onOpenTimer: (tabId: number) => void;
  onOpenHostOverrides: (tabId: number) => void;
  /** "none" marks the todo done, which removes it. */
  onSetTodo: (status: "todo" | "none") => void;
  /** Sets the tab's status color; "none" clears it. */
  onSetLight: (light: TrafficLight | "none") => void;
  onCloseTab: (tabId: number) => void;
  onEditPinnedUrl: (tabId: number) => void;
  onReplacePinnedUrl: (tabId: number) => void;
  onMoveToFolder: (tabId: number, folderId: string) => void;
  onRemoveFromFolder: (tabId: number) => void;
}

const itemClass =
  "hover:bg-zen-line-soft flex w-full cursor-pointer items-center gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] px-[var(--zen-space-3)] py-[var(--zen-space-2)] text-left font-[inherit] text-[length:var(--zen-text-md)]";

/** A status color in the menu's row of buttons, with no written label. */
const statusButtonClass =
  "hover:bg-zen-line-soft flex flex-1 cursor-pointer items-center justify-center rounded-[var(--zen-radius)] p-[var(--zen-space-2)]";

function MenuIcon({ children }: { children: ComponentChildren }) {
  return (
    <svg class="zen-icon size-[var(--zen-icon-md)] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

/**
 * Right-click menu for a tab, opened from the result rows, the issue column and
 * the todo column. `x`/`y` are the pointer position; the menu shifts left or up
 * when it would overflow the viewport.
 */
export function TabContextMenu({
  tab,
  x,
  y,
  isTodo,
  light,
  onRename,
  onOpenTimer,
  onOpenHostOverrides,
  onSetTodo,
  onSetLight,
  onCloseTab,
  onEditPinnedUrl,
  onReplacePinnedUrl,
  onMoveToFolder,
  onRemoveFromFolder,
}: TabContextMenuProps) {
  const tabId = tabBrowserId(tab);
  const canTodo = tabId !== undefined && !isEssentialTab(tab);
  const canMove = tabId !== undefined && !isEssentialTab(tab);
  const pinned = isPinnedTab(tab);
  const [folders, setFolders] = useState<OverlayFolderInfo[] | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const position = useClampedPosition(menuRef, x, y);

  useEffect(() => {
    if (!canMove) {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage({ type: "getFolders" })
      .then((listed) => {
        if (!cancelled) setFolders(listed);
      })
      .catch((error) => {
        debugError("Could not list folders:", error);
        if (!cancelled) setFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canMove]);

  const listedFolders = folders === null ? [] : foldersForMenu(folders);

  return (
    <div
      ref={menuRef}
      class="zs-menu border-zen-line-medium fixed z-50 min-w-[180px] rounded-[var(--zs-r-lcd)] border p-[var(--zen-space-1)]"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      data-testid="zen-tab-context-menu"
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {tabId !== undefined && (
        <button type="button" class={itemClass} role="menuitem" onClick={() => onCloseTab(tabId)}>
          <MenuIcon>
            <path d="M6 6l12 12M18 6 6 18" />
          </MenuIcon>
          Close tab
        </button>
      )}
      {canRenameTab(tab) && (
        <button type="button" class={itemClass} role="menuitem" onClick={onRename}>
          <MenuIcon>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
          </MenuIcon>
          Rename
        </button>
      )}
      {canMove && (
        <>
          <button
            type="button"
            class={itemClass}
            role="menuitem"
            aria-expanded={folderOpen}
            onClick={() => setFolderOpen((open) => !open)}
          >
            <MenuIcon>
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </MenuIcon>
            Move to folder
          </button>
          {folderOpen && (
            <div class="pl-[var(--zen-space-2)]" data-testid="zen-tab-folder-menu">
              {folders === null && (
                <div class="text-zen-subtle px-[var(--zen-space-3)] py-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]">
                  Loading folders…
                </div>
              )}
              {folders !== null && listedFolders.length === 0 && (
                <div class="text-zen-subtle px-[var(--zen-space-3)] py-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]">
                  No folders
                </div>
              )}
              {listedFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  class={cn(itemClass, tab.folderId === folder.id && "bg-zen-line-soft")}
                  role="menuitem"
                  onClick={() => onMoveToFolder(tabId, folder.id)}
                >
                  {folderMenuLabel(folders ?? [], folder)}
                </button>
              ))}
              {tab.folderId !== undefined && tabId !== undefined && (
                <button
                  type="button"
                  class={itemClass}
                  role="menuitem"
                  onClick={() => onRemoveFromFolder(tabId)}
                >
                  Remove from folder
                </button>
              )}
            </div>
          )}
        </>
      )}
      {tabId !== undefined && pinned && (
        <>
          <div class="bg-zen-line-soft my-1 h-px" role="separator" />
          <button
            type="button"
            class={itemClass}
            role="menuitem"
            onClick={() => onEditPinnedUrl(tabId)}
          >
            <MenuIcon>
              <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </MenuIcon>
            Edit pinned URL
          </button>
          <button
            type="button"
            class={itemClass}
            role="menuitem"
            onClick={() => onReplacePinnedUrl(tabId)}
          >
            <MenuIcon>
              <path d="M4 8h12M13 5l3 3-3 3" />
              <path d="M20 16H8M11 13l-3 3 3 3" />
            </MenuIcon>
            Replace pinned URL with current
          </button>
        </>
      )}
      {canTodo && (
        <>
          <div class="bg-zen-line-soft my-1 h-px" role="separator" />
          <button
            type="button"
            class={itemClass}
            role="menuitem"
            onClick={() => onSetTodo(isTodo ? "none" : "todo")}
          >
            <TodoIcon checked={isTodo} class="size-[var(--zen-icon-md)]" />
            {isTodo ? "Mark as done" : "Mark as todo"}
          </button>
        </>
      )}
      {tabId !== undefined && (
        <div
          class="flex items-center gap-[var(--zen-space-1)] px-[var(--zen-space-1)] py-[var(--zen-space-1)]"
          role="group"
          aria-label="Status"
        >
          {TRAFFIC_LIGHT_OPTIONS.map((option) => (
            <button
              key={option.light}
              type="button"
              class={cn(statusButtonClass, light === option.light && "bg-zen-line-soft")}
              role="menuitemradio"
              aria-checked={light === option.light}
              aria-label={option.label}
              data-traffic-light={option.light}
              onClick={() => onSetLight(option.light)}
            >
              <span
                aria-hidden="true"
                class={cn(
                  "size-[var(--zen-icon-md)] shrink-0 rounded-full",
                  trafficLightDotClass[option.light],
                )}
              />
            </button>
          ))}
          <button
            type="button"
            class={statusButtonClass}
            role="menuitemradio"
            aria-checked={false}
            aria-label="No status"
            title="No status"
            data-traffic-light="none"
            onClick={() => onSetLight("none")}
          >
            <MenuIcon>
              <circle cx="12" cy="12" r="8" />
              <path d="M7.5 16.5 16.5 7.5" />
            </MenuIcon>
          </button>
        </div>
      )}
      {tabId !== undefined && (
        <>
          <div class="bg-zen-line-soft my-1 h-px" role="separator" />
          <button type="button" class={itemClass} role="menuitem" onClick={() => onOpenTimer(tabId)}>
            <TimerIcon class="size-[var(--zen-icon-md)]" />
            Timer
          </button>
          <button
            type="button"
            class={itemClass}
            role="menuitem"
            onClick={() => onOpenHostOverrides(tabId)}
          >
            <span aria-hidden="true">⇄</span>
            Host overrides…
          </button>
        </>
      )}
    </div>
  );
}
