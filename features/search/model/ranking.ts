import { parseForgeUrl, cleanForgeTitle } from "@/features/forge/model/forge-label";
import {
  isEssentialTab,
  isUsableTabId,
  type FolderInfo,
  type SearchItem,
  type SpaceInfo,
  type TabInfo,
} from "@/shared/types";
import { type ForgeIssueEntry } from "@/features/forge/model/forge-label";

export type ForgeIssueSortMode = "recent" | "old";

interface FuzzyMatch {
  matches: boolean;
  score: number;
}

export function fuzzyMatchWithScore(str: string, queryLowerCase: string): FuzzyMatch {
  const query = normalizeSearchText(queryLowerCase);
  if (!query) {
    return { matches: false, score: 0 };
  }

  const normalized = normalizeSearchText(str);
  if (!normalized) {
    return { matches: false, score: 0 };
  }

  const queryWords = query.split(" ");
  const valueWords = normalized.split(" ");
  const substringIndex = normalized.indexOf(query);
  const prefixIndexes = queryWords.map((queryWord) =>
    valueWords.findIndex((valueWord) => valueWord.startsWith(queryWord)),
  );
  const prefixesInOrder =
    prefixIndexes.every((index) => index >= 0) &&
    prefixIndexes.every((index, i) => i === 0 || index >= (prefixIndexes[i - 1] ?? 0));

  if (substringIndex < 0 && !prefixesInOrder) {
    return { matches: false, score: 0 };
  }

  let score = 0;
  if (substringIndex >= 0) {
    score += 1000;
    if (substringIndex === 0 || normalized[substringIndex - 1] === " ") {
      score += 500;
    }
    score += Math.max(0, 100 - substringIndex * 2);
  }

  for (const queryWord of queryWords) {
    for (const valueWord of valueWords) {
      if (valueWord === queryWord) {
        score += 200;
      } else if (valueWord.startsWith(queryWord)) {
        score += 120;
      } else if (valueWord.includes(queryWord)) {
        score += 80;
      }
    }
  }

  score += Math.max(0, 200 - normalized.length);
  return { matches: true, score };
}

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

export function countExactQueryWords(value: string, query: string): number {
  const queryWords = tokenizeSearchText(query);
  if (queryWords.length === 0) {
    return 0;
  }

  const valueWords = new Set(tokenizeSearchText(value));
  return queryWords.filter((word) => valueWords.has(word)).length;
}

export function hasDirectMatch(value: string, queryLowerCase: string): boolean {
  const queryWords = tokenizeSearchText(queryLowerCase);
  if (queryWords.length === 0) {
    return false;
  }

  const valueWords = tokenizeSearchText(value);
  return queryWords.every((word) => valueWords.includes(word));
}

export function forgeEntryDisplayTitle(entry: ForgeIssueEntry): string {
  return entry.tab.customLabel?.trim() || entry.title;
}

function tabNameSearchText(tab: TabInfo): string {
  return `${tab.customLabel || ""} ${tab.title || ""}`.trim();
}

export function searchItemExactWordCount(item: SearchItem, query: string): number {
  if (item.kind === "space") {
    return Math.max(
      countExactQueryWords(item.data.name, query),
      countExactQueryWords(item.data.icon || "", query),
    );
  }

  return Math.max(
    countExactQueryWords(item.data.customLabel || "", query),
    countExactQueryWords(item.data.title || "", query),
    countExactQueryWords(tabNameSearchText(item.data), query),
    countExactQueryWords(item.data.workspaceName || "", query),
    countExactQueryWords(item.data.folderName || "", query),
  );
}

export function forgeEntryExactWordCount(entry: ForgeIssueEntry, query: string): number {
  return Math.max(
    countExactQueryWords(forgeEntryDisplayTitle(entry), query),
    countExactQueryWords(entry.title, query),
    countExactQueryWords(entry.tab.title || "", query),
    countExactQueryWords(entry.tab.customLabel || "", query),
    countExactQueryWords(tabNameSearchText(entry.tab), query),
    countExactQueryWords(entry.ref.id, query),
    countExactQueryWords(`#${entry.ref.id}`, query),
    countExactQueryWords(`!${entry.ref.id}`, query),
  );
}

function directMatchBonus(value: string, queryLowerCase: string): number {
  return hasDirectMatch(value, queryLowerCase) ? 10_000 : 0;
}

export function buildSearchItems(allTabs: TabInfo[], allSpaces: SpaceInfo[]): SearchItem[] {
  const items: SearchItem[] = allSpaces.map((space) => ({ kind: "space", data: space }));
  for (const tab of allTabs) {
    items.push({ kind: "tab", data: tab });
  }
  return items;
}

export function isPinnedSearchItem(item: SearchItem): boolean {
  return item.kind === "space" || (item.kind === "tab" && isEssentialTab(item.data));
}

function partitionPinnedSearchItems(items: SearchItem[]): {
  pinned: SearchItem[];
  rest: SearchItem[];
} {
  const spaces: SearchItem[] = [];
  const essentials: SearchItem[] = [];
  const rest: SearchItem[] = [];
  for (const item of items) {
    if (item.kind === "space") {
      spaces.push(item);
    } else if (item.kind === "tab" && isEssentialTab(item.data)) {
      essentials.push(item);
    } else {
      rest.push(item);
    }
  }
  return { pinned: [...spaces, ...essentials], rest };
}

export interface SearchItemGroup {
  folderId?: string;
  folderName?: string;
  items: SearchItem[];
  children: SearchItemGroup[];
}

export function groupSearchItems(
  items: SearchItem[],
  options: { groupFolders?: boolean; groupSubfolders?: boolean } = {},
): SearchItemGroup[] {
  const { pinned, rest } = partitionPinnedSearchItems(items);
  if (options.groupFolders === false) {
    const ordered = [...pinned, ...rest];
    return ordered.length ? [{ items: ordered, children: [] }] : [];
  }
  const groupSubfolders = options.groupSubfolders !== false;
  const groups: SearchItemGroup[] = [];

  for (const item of rest) {
    const folderPath: FolderInfo[] =
      item.kind === "tab" && !isEssentialTab(item.data)
        ? (item.data.folderPath ??
          (item.data.folderId || item.data.folderName
            ? [
                {
                  id: item.data.folderId || `name:${item.data.folderName}`,
                  name: item.data.folderName || "Folder",
                },
              ]
            : []))
        : [];
    const visibleFolderPath = groupSubfolders ? folderPath : folderPath.slice(0, 1);
    let currentGroups = groups;
    let currentGroup: SearchItemGroup | undefined;

    for (const folder of visibleFolderPath) {
      let group = currentGroups.find((candidate) => candidate.folderId === folder.id);
      if (!group) {
        group = { folderId: folder.id, folderName: folder.name, items: [], children: [] };
        currentGroups.push(group);
      }
      currentGroup = group;
      currentGroups = group.children;
    }

    if (currentGroup) {
      currentGroup.items.push(item);
    } else {
      const ungrouped = groups.find((group) => group.folderId === undefined);
      if (ungrouped) {
        ungrouped.items.push(item);
      } else {
        groups.push({ items: [item], children: [] });
      }
    }
  }

  if (!pinned.length) {
    return groups;
  }

  const first = groups[0];
  if (first && first.folderId === undefined) {
    first.items = [...pinned, ...first.items];
    return groups;
  }

  return [{ items: pinned, children: [] }, ...groups];
}

export type SearchItemGroupEntry =
  | { kind: "folder"; id: string; name: string; level: number }
  | { kind: "item"; item: SearchItem; folderLevel?: number };

export function flattenSearchItemGroups(groups: SearchItemGroup[]): SearchItemGroupEntry[] {
  const entries: SearchItemGroupEntry[] = [];

  const visit = (items: SearchItemGroup[], level: number) => {
    for (const group of items) {
      if (group.folderId !== undefined && group.folderName) {
        entries.push({ kind: "folder", id: group.folderId, name: group.folderName, level });
      }
      entries.push(
        ...group.items.map((item) => ({
          kind: "item" as const,
          item,
          folderLevel: group.folderId === undefined ? undefined : level,
        })),
      );
      visit(group.children, level + (group.folderId === undefined ? 0 : 1));
    }
  };

  visit(groups, 0);
  return entries;
}

export function buildForgeIssueEntries(allTabs: TabInfo[]): ForgeIssueEntry[] {
  return allTabs.flatMap((tab) => {
    const ref = parseForgeUrl(tab.url);
    if (!ref) {
      return [];
    }

    return [
      {
        ref,
        tab,
        title: cleanForgeTitle(tab.title || "", ref) || `${ref.platform} ${ref.kind} #${ref.id}`,
        projectLabel: `${ref.host}/${ref.projectPath}`,
      },
    ];
  });
}

export function parseForgeNavigatorQuery(query: string): {
  active: boolean;
  filterQuery: string;
} {
  const trimmed = query.trimStart();
  if (trimmed.startsWith("#") || trimmed.startsWith("!")) {
    return { active: true, filterQuery: trimmed.slice(1).trimStart() };
  }
  return { active: false, filterQuery: query };
}

export function forgeEntrySearchTexts(entry: ForgeIssueEntry): string[] {
  return [
    forgeEntryDisplayTitle(entry),
    entry.title,
    entry.tab.title || "",
    entry.tab.customLabel || "",
    tabNameSearchText(entry.tab),
    entry.projectLabel,
    entry.ref.id,
    `#${entry.ref.id}`,
    `!${entry.ref.id}`,
    entry.ref.kind.replaceAll("_", " "),
    entry.ref.platform,
  ];
}

export function isSameForgeEntry(first: ForgeIssueEntry, second: ForgeIssueEntry): boolean {
  return (
    first.ref.url === second.ref.url &&
    first.tab.id === second.tab.id &&
    first.tab.domId === second.tab.domId
  );
}

export interface RankedForgeIssueEntry {
  entry: ForgeIssueEntry;
  score: number;
  direct: boolean;
}

export function rankForgeIssueEntries(
  entries: ForgeIssueEntry[],
  query: string,
): RankedForgeIssueEntry[] {
  if (!query.trim()) {
    return entries.map((entry) => ({ entry, score: 0, direct: false }));
  }

  const queryLowerCase = query.trim().toLowerCase();
  return entries
    .map((entry) => {
      const texts = forgeEntrySearchTexts(entry);
      const matches = texts.map((value) => fuzzyMatchWithScore(value, queryLowerCase));
      const queryWords = tokenizeSearchText(queryLowerCase);
      const words = forgeEntryExactWordCount(entry, queryLowerCase);
      const direct = queryWords.length > 0 && words >= queryWords.length;
      return {
        entry,
        direct,
        score:
          Math.max(...matches.filter((match) => match.matches).map((match) => match.score), -1) +
          words * 5_000 +
          (direct ? 10_000 : 0),
      };
    })
    .filter(({ score }) => score >= 0)
    .sort(
      (first, second) =>
        second.score - first.score ||
        compareOptionalTimestamp(
          first.entry.tab.lastOpenedAt,
          second.entry.tab.lastOpenedAt,
          "desc",
        ),
    );
}

export function bestForgeNavigatorIndex(
  visualEntries: ForgeIssueEntry[],
  ranked: RankedForgeIssueEntry[],
  query = "",
): number {
  const queryWords = tokenizeSearchText(query);
  if (queryWords.length === 0) {
    const best = ranked.find((entry) => entry.direct) ?? ranked[0];
    if (!best) {
      return 0;
    }
    const index = visualEntries.findIndex((entry) => isSameForgeEntry(entry, best.entry));
    return index >= 0 ? index : 0;
  }

  let bestIndex = 0;
  let bestWords = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  visualEntries.forEach((entry, index) => {
    const words = forgeEntryExactWordCount(entry, query);
    const score =
      ranked.find((rankedEntry) => isSameForgeEntry(rankedEntry.entry, entry))?.score ?? -1;
    if (words > bestWords || (words === bestWords && score > bestScore)) {
      bestWords = words;
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function filterForgeIssueEntries(
  entries: ForgeIssueEntry[],
  query: string,
): ForgeIssueEntry[] {
  if (!query.trim()) {
    return entries;
  }

  return rankForgeIssueEntries(entries, query).map(({ entry }) => entry);
}

function compareOptionalTimestamp(
  first: number | undefined,
  second: number | undefined,
  direction: "asc" | "desc",
): number {
  if (first === undefined && second === undefined) return 0;
  if (first === undefined) return 1;
  if (second === undefined) return -1;
  return direction === "asc" ? first - second : second - first;
}

export function sortForgeIssueEntries(
  entries: ForgeIssueEntry[],
  mode: ForgeIssueSortMode,
): ForgeIssueEntry[] {
  return [...entries].sort((first, second) => {
    const direction = mode === "recent" ? "desc" : "asc";
    return (
      compareOptionalTimestamp(first.tab.lastOpenedAt, second.tab.lastOpenedAt, direction) ||
      Number(first.ref.id) - Number(second.ref.id)
    );
  });
}

export interface ForgeIssueProjectGroup {
  projectLabel: string;
  issues: ForgeIssueEntry[];
  requests: ForgeIssueEntry[];
}

export interface ForgeIssueProviderGroup {
  platform: ForgeIssueEntry["ref"]["platform"];
  projects: ForgeIssueProjectGroup[];
}

export function groupForgeIssueEntries(
  entries: ForgeIssueEntry[],
  sortMode: ForgeIssueSortMode,
): ForgeIssueProviderGroup[] {
  const providers = new Map<string, Map<string, ForgeIssueProjectGroup>>();

  for (const entry of sortForgeIssueEntries(entries, sortMode)) {
    const projects = providers.get(entry.ref.platform) || new Map<string, ForgeIssueProjectGroup>();
    const project = projects.get(entry.projectLabel) || {
      projectLabel: entry.projectLabel,
      issues: [],
      requests: [],
    };
    if (entry.ref.kind === "issue") {
      project.issues.push(entry);
    } else {
      project.requests.push(entry);
    }
    projects.set(entry.projectLabel, project);
    providers.set(entry.ref.platform, projects);
  }

  return [...providers.entries()].map(([platform, projects]) => ({
    platform: platform as ForgeIssueEntry["ref"]["platform"],
    projects: [...projects.values()],
  }));
}

export function flattenForgeNavigatorEntries(
  entries: ForgeIssueEntry[],
  sortMode: ForgeIssueSortMode,
): ForgeIssueEntry[] {
  return groupForgeIssueEntries(entries, sortMode).flatMap((provider) =>
    provider.projects.flatMap((project) => [...project.issues, ...project.requests]),
  );
}

export function prioritizeCurrentTab(
  items: SearchItem[],
  currentTabId?: number | null,
): SearchItem[] {
  const current = isUsableTabId(currentTabId)
    ? items.find((item) => item.kind === "tab" && item.data.id === currentTabId)
    : items.find((item) => item.kind === "tab" && item.data.active);
  const movableCurrent = current && !isPinnedSearchItem(current) ? current : undefined;
  const { pinned, rest } = partitionPinnedSearchItems(
    movableCurrent ? items.filter((item) => item !== movableCurrent) : items,
  );

  if (!movableCurrent) {
    return pinned.length ? [...pinned, ...rest] : items;
  }
  return [...pinned, movableCurrent, ...rest];
}

export function filterSearchItems(items: SearchItem[], query: string): SearchItem[] {
  if (!query.trim()) {
    return items;
  }

  const queryLowerCase = query.trim().toLowerCase();
  const scored: SearchItem[] = [];

  for (const item of items) {
    if (item.kind === "space") {
      const nameMatch = fuzzyMatchWithScore(item.data.name, queryLowerCase);
      const iconMatch = fuzzyMatchWithScore(item.data.icon || "", queryLowerCase);
      if (!nameMatch.matches && !iconMatch.matches) {
        continue;
      }

      scored.push({
        kind: "space",
        data: {
          ...item.data,
          score:
            Math.max(
              nameMatch.score +
                directMatchBonus(item.data.name, queryLowerCase) +
                countExactQueryWords(item.data.name, queryLowerCase) * 5_000,
              iconMatch.score +
                directMatchBonus(item.data.icon || "", queryLowerCase) +
                countExactQueryWords(item.data.icon || "", queryLowerCase) * 5_000,
            ) + 300,
        },
      });
      continue;
    }

    const customLabel = item.data.customLabel || "";
    const title = item.data.title || "";
    const combinedName = tabNameSearchText(item.data);
    const labelMatch = fuzzyMatchWithScore(customLabel, queryLowerCase);
    const titleMatch = fuzzyMatchWithScore(title, queryLowerCase);
    const combinedMatch = fuzzyMatchWithScore(combinedName, queryLowerCase);
    const urlMatch = fuzzyMatchWithScore(item.data.url || "", queryLowerCase);
    const workspaceMatch = fuzzyMatchWithScore(item.data.workspaceName || "", queryLowerCase);
    const folderMatch = fuzzyMatchWithScore(item.data.folderName || "", queryLowerCase);
    if (
      !labelMatch.matches &&
      !titleMatch.matches &&
      !combinedMatch.matches &&
      !urlMatch.matches &&
      !workspaceMatch.matches &&
      !folderMatch.matches
    ) {
      continue;
    }

    scored.push({
      kind: "tab",
      data: {
        ...item.data,
        score: Math.max(
          labelMatch.score +
            directMatchBonus(customLabel, queryLowerCase) +
            countExactQueryWords(customLabel, queryLowerCase) * 5_000,
          titleMatch.score +
            directMatchBonus(title, queryLowerCase) +
            countExactQueryWords(title, queryLowerCase) * 5_000,
          combinedMatch.score +
            directMatchBonus(combinedName, queryLowerCase) +
            countExactQueryWords(combinedName, queryLowerCase) * 5_000,
          urlMatch.score + directMatchBonus(item.data.url || "", queryLowerCase),
          workspaceMatch.score +
            directMatchBonus(item.data.workspaceName || "", queryLowerCase) +
            countExactQueryWords(item.data.workspaceName || "", queryLowerCase) * 5_000,
          folderMatch.score +
            directMatchBonus(item.data.folderName || "", queryLowerCase) +
            countExactQueryWords(item.data.folderName || "", queryLowerCase) * 5_000,
        ),
      },
    });
  }

  return scored.sort((a, b) => (b.data.score ?? 0) - (a.data.score ?? 0));
}
