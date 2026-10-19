type ContextMenuContext = NonNullable<
  Parameters<typeof browser.contextMenus.create>[0]["contexts"]
>[number];

/** Firefox's tab-strip context, which Chrome's typings do not list. */
export const TAB_CONTEXT = "tab" as unknown as ContextMenuContext;
