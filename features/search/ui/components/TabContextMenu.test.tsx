import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { TabContextMenu } from "@/features/search/ui/components/TabContextMenu";
import type { TabInfo } from "@/shared/types";

const tab: TabInfo = {
  id: 1,
  title: "First tab",
  url: "https://example.com",
  favIconUrl: "",
  windowId: 1,
};

function mount(actions?: {
  todos?: boolean;
  copyLink?: boolean;
  timers?: boolean;
  statusColors?: boolean;
  hosts?: boolean;
}) {
  Object.assign(globalThis, {
    browser: {
      runtime: {
        sendMessage: vi.fn(async ({ type }: { type: string }) =>
          type === "getFolders" ? [] : undefined,
        ),
      },
    },
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(
    <TabContextMenu
      tab={tab}
      x={0}
      y={0}
      isTodo={false}
      actions={actions}
      onRename={vi.fn()}
      onCopyLink={vi.fn()}
      onOpenTimer={vi.fn()}
      onOpenHostOverrides={vi.fn()}
      onSetTodo={vi.fn()}
      onSetLight={vi.fn()}
      onCloseTab={vi.fn()}
      onEditPinnedUrl={vi.fn()}
      onReplacePinnedUrl={vi.fn()}
      onMoveToFolder={vi.fn()}
      onRemoveFromFolder={vi.fn()}
    />,
    root,
  );
  const menu = root.querySelector("[data-testid='zen-tab-context-menu']")!;
  const labels = [...menu.querySelectorAll("[role='menuitem']")].map((node) =>
    node.textContent?.replace(/\s+/g, " ").trim(),
  );
  const unmount = () => {
    render(null, root);
    root.remove();
  };
  return { root, menu, labels, unmount };
}

describe("TabContextMenu", () => {
  it("hides todo, status, timer, host and copy items when those features are off", () => {
    const { menu, labels, unmount } = mount({
      todos: false,
      copyLink: false,
      timers: false,
      statusColors: false,
      hosts: false,
    });

    expect(labels).toEqual(["Close tab", "Rename", "Move to folder"]);
    expect(menu.querySelector("[aria-label='Status']")).toBeNull();
    expect(menu.textContent).not.toContain("Mark as todo");
    expect(menu.textContent).not.toContain("Timer");
    expect(menu.textContent).not.toContain("Host overrides");
    expect(menu.querySelector("[data-testid='zen-copy-link-menu']")).toBeNull();

    unmount();
  });

  it("shows those items when the flags stay on", () => {
    const { menu, labels, unmount } = mount();

    expect(labels).toContain("Mark as todo");
    expect(labels).toContain("Copy link");
    expect(labels).toContain("Timer");
    expect(labels).toContain("⇄Host overrides…");
    expect(menu.querySelector("[aria-label='Status']")).toBeTruthy();

    unmount();
  });
});
