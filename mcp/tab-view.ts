import type { TabSummary } from "@/shared/messaging/bridge-protocol";
import type { SpaceInfo } from "@/shared/messaging/protocol";

export const TAB_FIELDS = ["counts", "titles", "titles_urls", "full"] as const;
export const TAB_GROUPINGS = ["none", "space", "folder"] as const;

export type TabFields = (typeof TAB_FIELDS)[number];
export type TabGrouping = (typeof TAB_GROUPINGS)[number];

export interface TabListOptions {
  fields: TabFields;
  groupBy: TabGrouping;
  limit: number;
  offset: number;
  /** Whether a space or folder filter was applied; empty spaces are then left out of the counts. */
  filtered: boolean;
}

export const ESSENTIALS_LABEL = "Essentials (shared by all spaces)";

interface FolderCount {
  folderId: string;
  folderName: string;
  path: string;
  tabCount: number;
}

interface SpaceCount {
  spaceId: string;
  spaceName: string;
  active?: true;
  tabCount: number;
  folders: FolderCount[];
}

type TabView = Record<string, unknown>;

function displayTitle(tab: TabSummary): string {
  return tab.customLabel || tab.title;
}

function folderPathLabel(tab: TabSummary): string | undefined {
  return tab.folderPath?.length
    ? tab.folderPath.map((folder) => folder.name).join(" / ")
    : undefined;
}

/**
 * Shapes one tab for the requested detail level. Grouped output already says
 * which space and folder a tab is in, so only flat output repeats that context.
 */
function viewTab(tab: TabSummary, fields: TabFields, withContext: boolean): TabView {
  const marks = {
    ...(tab.active ? { active: true } : {}),
    // Essential tabs are pinned across every space, so they have no space of their own.
    ...(tab.essential ? { essential: true, global: true } : {}),
    ...(tab.color ? { color: tab.color } : {}),
  };

  if (fields === "full") {
    return {
      id: tab.id,
      title: displayTitle(tab),
      ...(tab.customLabel && tab.customLabel !== tab.title ? { originalTitle: tab.title } : {}),
      url: tab.url,
      windowId: tab.windowId,
      spaceId: tab.essential ? null : (tab.spaceId ?? null),
      spaceName: tab.essential ? ESSENTIALS_LABEL : (tab.spaceName ?? null),
      folderId: tab.folderId ?? null,
      folderName: tab.folderName ?? null,
      folderPath: tab.folderPath ?? [],
      ...marks,
    };
  }

  const context =
    withContext && !tab.essential
      ? {
          ...(tab.spaceName ? { space: tab.spaceName } : {}),
          ...(folderPathLabel(tab) ? { folder: folderPathLabel(tab) } : {}),
        }
      : {};

  return {
    id: tab.id,
    title: displayTitle(tab),
    ...(fields === "titles_urls" ? { url: tab.url } : {}),
    ...context,
    ...marks,
  };
}

/** Essentials first, then spaces in Zen's order, keeping Zen's tab order inside each space. */
function orderTabs(tabs: TabSummary[], spaces: SpaceInfo[]): TabSummary[] {
  const spaceIndex = new Map(spaces.map((space, index) => [space.id, index]));
  const rank = (tab: TabSummary) =>
    tab.essential ? -1 : (spaceIndex.get(tab.spaceId ?? "") ?? spaces.length);
  return tabs
    .map((tab, index) => ({ tab, index }))
    .sort((a, b) => rank(a.tab) - rank(b.tab) || a.index - b.index)
    .map(({ tab }) => tab);
}

function countBySpace(tabs: TabSummary[], spaces: SpaceInfo[], filtered: boolean): SpaceCount[] {
  const counts = new Map<string, SpaceCount>();
  for (const space of spaces) {
    counts.set(space.id, {
      spaceId: space.id,
      spaceName: space.name,
      ...(space.isActive ? { active: true as const } : {}),
      tabCount: 0,
      folders: [],
    });
  }

  for (const tab of tabs) {
    if (tab.essential) {
      continue;
    }
    const spaceId = tab.spaceId ?? "";
    let space = counts.get(spaceId);
    if (!space) {
      space = { spaceId, spaceName: tab.spaceName ?? "", tabCount: 0, folders: [] };
      counts.set(spaceId, space);
    }
    space.tabCount++;

    if (tab.folderId) {
      let folder = space.folders.find((entry) => entry.folderId === tab.folderId);
      if (!folder) {
        folder = {
          folderId: tab.folderId,
          folderName: tab.folderName ?? "",
          path: folderPathLabel(tab) ?? tab.folderName ?? "",
          tabCount: 0,
        };
        space.folders.push(folder);
      }
      folder.tabCount++;
    }
  }

  const all = [...counts.values()];
  return filtered ? all.filter((space) => space.tabCount > 0) : all;
}

function groupBySpace(page: TabSummary[], fields: TabFields, byFolder: boolean) {
  const essentials = page.filter((tab) => tab.essential);
  const spaces = new Map<string, { spaceId: string; spaceName: string; tabs: TabSummary[] }>();
  for (const tab of page) {
    if (tab.essential) {
      continue;
    }
    const key = tab.spaceId ?? "";
    let space = spaces.get(key);
    if (!space) {
      space = { spaceId: key, spaceName: tab.spaceName ?? "", tabs: [] };
      spaces.set(key, space);
    }
    space.tabs.push(tab);
  }

  const view = (tab: TabSummary) => viewTab(tab, fields, false);

  return {
    ...(essentials.length
      ? { essentials: { name: ESSENTIALS_LABEL, global: true, tabs: essentials.map(view) } }
      : {}),
    spaces: [...spaces.values()].map((space) => {
      if (!byFolder) {
        return { spaceId: space.spaceId, spaceName: space.spaceName, tabs: space.tabs.map(view) };
      }

      const folders = new Map<
        string,
        { folderId: string; folderName: string; path: string; tabs: TabView[] }
      >();
      const unfiledTabs: TabView[] = [];
      for (const tab of space.tabs) {
        if (!tab.folderId) {
          unfiledTabs.push(view(tab));
          continue;
        }
        let folder = folders.get(tab.folderId);
        if (!folder) {
          folder = {
            folderId: tab.folderId,
            folderName: tab.folderName ?? "",
            path: folderPathLabel(tab) ?? tab.folderName ?? "",
            tabs: [],
          };
          folders.set(tab.folderId, folder);
        }
        folder.tabs.push(view(tab));
      }
      return {
        spaceId: space.spaceId,
        spaceName: space.spaceName,
        folders: [...folders.values()],
        unfiledTabs,
      };
    }),
  };
}

/**
 * Builds the `zen_list_tabs` result: totals for the whole (filtered) tab set,
 * then one page of tabs, flat or grouped, at the requested detail level.
 */
export function buildTabListView(
  tabs: TabSummary[],
  spaces: SpaceInfo[],
  options: TabListOptions,
): Record<string, unknown> {
  const ordered = orderTabs(tabs, spaces);
  const summary = {
    totalTabs: ordered.length,
    essentialTabs: ordered.filter((tab) => tab.essential).length,
    tabsBySpace: countBySpace(ordered, spaces, options.filtered),
  };

  if (options.fields === "counts") {
    return summary;
  }

  const page = ordered.slice(options.offset, options.offset + options.limit);
  const end = options.offset + page.length;
  const pageInfo = {
    offset: options.offset,
    limit: options.limit,
    returned: page.length,
    nextOffset: end < ordered.length ? end : null,
  };

  if (options.groupBy === "none") {
    return {
      ...summary,
      page: pageInfo,
      tabs: page.map((tab) => viewTab(tab, options.fields, true)),
    };
  }

  return {
    ...summary,
    page: pageInfo,
    ...groupBySpace(page, options.fields, options.groupBy === "folder"),
  };
}
