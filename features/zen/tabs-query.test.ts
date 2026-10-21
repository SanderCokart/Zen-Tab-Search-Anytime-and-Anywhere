import { describe, expect, it, vi } from "vitest";
import type { WorkspaceAdapter } from "@/features/zen/adapter";
import { createTabQuery } from "@/features/zen/tabs-query";
import type { TabInfo } from "@/shared/types";

function zenTab(id: number, customLabel = ""): TabInfo {
  return {
    id,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    favIconUrl: "",
    windowId: 1,
    customLabel,
  };
}

describe("listAllTabs", () => {
  it("lists Zen's tabs from every space, then other windows' tabs with their labels", async () => {
    const workspace = {
      listTabs: vi.fn(async () => [zenTab(2), zenTab(74, "⏱ 51s | Hetzner")]),
      getCustomLabels: vi.fn(async () => ({ 90: "Other window" })),
    } as unknown as WorkspaceAdapter;
    Object.assign(globalThis, {
      browser: {
        tabs: {
          // Leaves out tab 74, which sits in a space Zen has not opened.
          query: vi.fn(async () => [
            { id: 2, title: "Tab 2", url: "https://example.com/2" },
            { id: 90, title: "Elsewhere", url: "https://example.com/90" },
          ]),
        },
      },
    });

    await expect(createTabQuery(workspace).listAllTabs()).resolves.toEqual([
      { id: 2, title: "Tab 2", url: "https://example.com/2", customLabel: "" },
      { id: 74, title: "Tab 74", url: "https://example.com/74", customLabel: "⏱ 51s | Hetzner" },
      { id: 90, title: "Elsewhere", url: "https://example.com/90", customLabel: "Other window" },
    ]);
    expect(workspace.getCustomLabels).toHaveBeenCalledWith([90]);
  });

  it("falls back to Firefox's tabs when Zen's list is unavailable", async () => {
    const workspace = {
      listTabs: vi.fn(async () => {
        throw new Error("no Zen window yet");
      }),
      getCustomLabels: vi.fn(async () => ({})),
    } as unknown as WorkspaceAdapter;
    Object.assign(globalThis, {
      browser: { tabs: { query: vi.fn(async () => [{ id: 3, title: "T", url: "https://a" }]) } },
    });

    await expect(createTabQuery(workspace).listAllTabs()).resolves.toEqual([
      { id: 3, title: "T", url: "https://a", customLabel: "" },
    ]);
  });
});
