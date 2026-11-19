import { describe, expect, it, vi } from "vitest";
import {
  forgeOrganizeModeFromMenuId,
  handleForgeOrganizeContextMenuClick,
} from "@/features/forge/background/context-menu";

describe("forge organize tab menu", () => {
  it("maps the submenu items to organize modes", () => {
    expect(forgeOrganizeModeFromMenuId("tab-organize-forge-tree")).toBe("tree");
    expect(forgeOrganizeModeFromMenuId("tab-organize-forge-by-issue")).toBe("byIssue");
    expect(forgeOrganizeModeFromMenuId("tab-todo-mark-todo")).toBeUndefined();
  });

  it("runs organize for a matching click and ignores other menus", async () => {
    const organize = vi.fn(async () => undefined);
    const onChanged = vi.fn();
    expect(
      handleForgeOrganizeContextMenuClick("tab-organize-forge-by-issue", 4, organize, onChanged),
    ).toBe(true);
    expect(
      handleForgeOrganizeContextMenuClick("tab-todo-mark-todo", 4, organize, onChanged),
    ).toBe(false);
    await vi.waitFor(() => expect(organize).toHaveBeenCalledWith(4, "byIssue"));
    expect(onChanged).toHaveBeenCalledOnce();
    expect(organize).toHaveBeenCalledOnce();
  });
});
