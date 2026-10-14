// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TabSummary } from "@/shared/messaging/bridge-protocol";
import type { SpaceInfo } from "@/shared/messaging/protocol";
import { buildTabListView, ESSENTIALS_LABEL, type TabListOptions } from "./tab-view";

const spaces: SpaceInfo[] = [
  { id: "work", name: "Work", isActive: true },
  { id: "home", name: "Home", isActive: false },
  { id: "empty", name: "Empty", isActive: false },
];

function tab(id: number, partial: Partial<TabSummary> = {}): TabSummary {
  return { id, title: `Tab ${id}`, url: `https://example.com/${id}`, windowId: 1, ...partial };
}

const docs = { id: "docs", name: "Docs" };
const api = { id: "api", name: "API" };

// Zen order deliberately mixes spaces so ordering is exercised.
const tabs: TabSummary[] = [
  tab(1, { spaceId: "home", spaceName: "Home" }),
  tab(2, {
    spaceId: "work",
    spaceName: "Work",
    folderId: "api",
    folderName: "API",
    folderPath: [docs, api],
  }),
  tab(3, { essential: true, spaceId: "work", spaceName: "Work" }),
  tab(4, {
    spaceId: "work",
    spaceName: "Work",
    folderId: "docs",
    folderName: "Docs",
    folderPath: [docs],
    customLabel: "Handbook",
    active: true,
  }),
  tab(5, { spaceId: "work", spaceName: "Work" }),
];

const defaults: TabListOptions = {
  fields: "titles_urls",
  groupBy: "space",
  limit: 100,
  offset: 0,
  filtered: false,
};

describe("buildTabListView", () => {
  it("returns only totals in counts mode, including empty spaces and per-folder counts", () => {
    expect(buildTabListView(tabs, spaces, { ...defaults, fields: "counts" })).toEqual({
      totalTabs: 5,
      essentialTabs: 1,
      tabsBySpace: [
        {
          spaceId: "work",
          spaceName: "Work",
          active: true,
          tabCount: 3,
          folders: [
            { folderId: "api", folderName: "API", path: "Docs / API", tabCount: 1 },
            { folderId: "docs", folderName: "Docs", path: "Docs", tabCount: 1 },
          ],
        },
        { spaceId: "home", spaceName: "Home", tabCount: 1, folders: [] },
        { spaceId: "empty", spaceName: "Empty", tabCount: 0, folders: [] },
      ],
    });
  });

  it("leaves empty spaces out of the counts when a filter was applied", () => {
    const view = buildTabListView([tabs[0]!], spaces, {
      ...defaults,
      fields: "counts",
      filtered: true,
    });
    expect(view.tabsBySpace).toEqual([
      { spaceId: "home", spaceName: "Home", tabCount: 1, folders: [] },
    ]);
  });

  it("groups by space with essentials marked global and listed first", () => {
    const view = buildTabListView(tabs, spaces, defaults);
    expect(view.essentials).toEqual({
      name: ESSENTIALS_LABEL,
      global: true,
      tabs: [
        {
          id: 3,
          title: "Tab 3",
          url: "https://example.com/3",
          essential: true,
          global: true,
        },
      ],
    });
    expect(view.spaces).toEqual([
      {
        spaceId: "work",
        spaceName: "Work",
        tabs: [
          { id: 2, title: "Tab 2", url: "https://example.com/2" },
          { id: 4, title: "Handbook", url: "https://example.com/4", active: true },
          { id: 5, title: "Tab 5", url: "https://example.com/5" },
        ],
      },
      {
        spaceId: "home",
        spaceName: "Home",
        tabs: [{ id: 1, title: "Tab 1", url: "https://example.com/1" }],
      },
    ]);
  });

  it("groups by folder within each space, keeping tabs outside folders apart", () => {
    const view = buildTabListView(tabs, spaces, {
      ...defaults,
      groupBy: "folder",
      fields: "titles",
    });
    expect(view.spaces).toEqual([
      {
        spaceId: "work",
        spaceName: "Work",
        folders: [
          {
            folderId: "api",
            folderName: "API",
            path: "Docs / API",
            tabs: [{ id: 2, title: "Tab 2" }],
          },
          {
            folderId: "docs",
            folderName: "Docs",
            path: "Docs",
            tabs: [{ id: 4, title: "Handbook", active: true }],
          },
        ],
        unfiledTabs: [{ id: 5, title: "Tab 5" }],
      },
      { spaceId: "home", spaceName: "Home", folders: [], unfiledTabs: [{ id: 1, title: "Tab 1" }] },
    ]);
  });

  it("pages through the ordered list and keeps the totals for the whole set", () => {
    const first = buildTabListView(tabs, spaces, { ...defaults, groupBy: "none", limit: 2 });
    expect(first.totalTabs).toBe(5);
    expect(first.page).toEqual({ offset: 0, limit: 2, returned: 2, nextOffset: 2 });
    expect((first.tabs as { id: number }[]).map((entry) => entry.id)).toEqual([3, 2]);

    const last = buildTabListView(tabs, spaces, {
      ...defaults,
      groupBy: "none",
      limit: 2,
      offset: 4,
    });
    expect(last.page).toEqual({ offset: 4, limit: 2, returned: 1, nextOffset: null });
    expect(last.tabs).toEqual([
      { id: 1, title: "Tab 1", url: "https://example.com/1", space: "Home" },
    ]);
  });

  it("includes a tab's traffic-light color when it has one", () => {
    const view = buildTabListView(
      [tab(4, { spaceId: "work", spaceName: "Work", color: "green", active: true })],
      spaces,
      { ...defaults, groupBy: "none", fields: "titles" },
    );
    expect(view.tabs).toEqual([
      { id: 4, title: "Tab 4", space: "Work", active: true, color: "green" },
    ]);
  });

  it("adds space and folder context to flat lists, but not to essentials", () => {
    const view = buildTabListView(tabs, spaces, { ...defaults, groupBy: "none", fields: "titles" });
    expect(view.tabs).toEqual([
      { id: 3, title: "Tab 3", essential: true, global: true },
      { id: 2, title: "Tab 2", space: "Work", folder: "Docs / API" },
      { id: 4, title: "Handbook", space: "Work", folder: "Docs", active: true },
      { id: 5, title: "Tab 5", space: "Work" },
      { id: 1, title: "Tab 1", space: "Home" },
    ]);
  });

  it("gives every tab explicit space fields in full mode, with null space for essentials", () => {
    const view = buildTabListView([tabs[2]!, tabs[3]!], spaces, {
      ...defaults,
      groupBy: "none",
      fields: "full",
    });
    expect(view.tabs).toEqual([
      {
        id: 3,
        title: "Tab 3",
        url: "https://example.com/3",
        windowId: 1,
        spaceId: null,
        spaceName: ESSENTIALS_LABEL,
        folderId: null,
        folderName: null,
        folderPath: [],
        essential: true,
        global: true,
      },
      {
        id: 4,
        title: "Handbook",
        originalTitle: "Tab 4",
        url: "https://example.com/4",
        windowId: 1,
        spaceId: "work",
        spaceName: "Work",
        folderId: "docs",
        folderName: "Docs",
        folderPath: [docs],
        active: true,
      },
    ]);
  });
});
