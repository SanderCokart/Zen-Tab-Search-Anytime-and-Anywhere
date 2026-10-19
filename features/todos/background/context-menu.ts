import { formatError, LOG_PREFIX } from "@/shared/log";
import { TAB_CONTEXT } from "@/shared/context-menus";
import type { TodoService } from "@/features/todos/background/todo-service";
import type { TodoStatus } from "@/shared/types";

/** Menu item ID to the status it sets. Marking a todo done removes it. */
const TODO_MENU_ACTIONS: Record<string, TodoStatus | "none"> = {
  "tab-todo-mark-todo": "todo",
  "tab-todo-mark-done": "none",
};

/**
 * Adds the todo submenu to the tab context menu. Called from inside the shared
 * `removeAll` reset in `app/background/context-menus.ts`, so menus cannot wipe each other out.
 */
export function createTodoContextMenuItems(): void {
  browser.contextMenus.create({
    id: "tab-todo",
    title: "Todo",
    contexts: [TAB_CONTEXT],
  });
  for (const [id, title] of [
    ["tab-todo-mark-todo", "Mark as todo"],
    ["tab-todo-mark-done", "Mark as done"],
  ]) {
    browser.contextMenus.create({
      id,
      parentId: "tab-todo",
      title,
      contexts: [TAB_CONTEXT],
    });
  }
}

/** Handles a todo menu click. Returns false when the click was for another menu. */
export function handleTodoContextMenuClick(
  menuItemId: string | number,
  tabId: number,
  todoService: TodoService,
  onChanged: () => void,
): boolean {
  const status = TODO_MENU_ACTIONS[String(menuItemId)];
  if (!status) {
    return false;
  }

  todoService
    .setTodo(tabId, status)
    .then(onChanged)
    .catch((error) => {
      console.error(`${LOG_PREFIX} Could not update todo from the tab menu:`, formatError(error));
    });
  return true;
}
