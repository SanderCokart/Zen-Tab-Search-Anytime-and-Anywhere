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

export interface SearchField {
  normalized: string;
  tokens: string[];
  tokenSet: Set<string>;
}

export interface SearchDocument {
  item: SearchItem;
  fields: SearchField[];
  /** Hostname + path tokens; omitted from 1-character queries. */
  urlField?: SearchField;
  /** Label+title, used when neither field matches a multi-word query alone. */
  combinedField?: SearchField;
}

const SCHEME_RE = /^https?:\/\//i;
const WWW_RE = /^www\./i;

export function compileSearchField(value: string): SearchField {
  const normalized = normalizeSearchText(value);
  const tokens = normalized ? normalized.split(" ").filter(Boolean) : [];
  return { normalized, tokens, tokenSet: new Set(tokens) };
}

export function urlSearchText(url: string): string {
  return url.replace(SCHEME_RE, "").replace(WWW_RE, "");
}

export function buildSearchDocuments(items: SearchItem[]): SearchDocument[] {
  return items.map((item) => {
    if (item.kind === "space") {
      return {
        item,
        fields: [compileSearchField(item.data.name), compileSearchField(item.data.icon || "")],
      };
    }

    const label = compileSearchField(item.data.customLabel || "");
    const title = compileSearchField(item.data.title || "");
    return {
      item,
      fields: [
        label,
        title,
        compileSearchField(item.data.workspaceName || ""),
        compileSearchField(item.data.folderName || ""),
      ],
      urlField: compileSearchField(urlSearchText(item.data.url || "")),
      combinedField: compileSearchField(tabNameSearchText(item.data)),
    };
  });
}

function fuzzyMatchPrepared(field: SearchField, query: string, queryWords: string[]): FuzzyMatch {
  if (!query || !field.normalized) {
    return { matches: false, score: 0 };
  }

  const substringIndex = field.normalized.indexOf(query);
  const prefixIndexes = queryWords.map((queryWord) =>
    field.tokens.findIndex((valueWord) => valueWord.startsWith(queryWord)),
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
    if (substringIndex === 0 || field.normalized[substringIndex - 1] === " ") {
      score += 500;
    }
    score += Math.max(0, 100 - substringIndex * 2);
  }

  for (const queryWord of queryWords) {
    for (const valueWord of field.tokens) {
      if (valueWord === queryWord) {
        score += 200;
      } else if (valueWord.startsWith(queryWord)) {
        score += 120;
      } else if (valueWord.includes(queryWord)) {
        score += 80;
      }
    }
  }

  score += Math.max(0, 200 - field.normalized.length);
  return { matches: true, score };
}

export function fuzzyMatchWithScore(str: string, queryLowerCase: string): FuzzyMatch {
  const query = normalizeSearchText(queryLowerCase);
  if (!query) {
    return { matches: false, score: 0 };
  }
  return fuzzyMatchPrepared(compileSearchField(str), query, query.split(" ").filter(Boolean));
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

export function countExactQueryWordsPrepared(tokenSet: Set<string>, queryWords: string[]): number {
  if (queryWords.length === 0) {
    return 0;
  }
  return queryWords.filter((word) => tokenSet.has(word)).length;
}

export function countExactQueryWords(value: string, query: string): number {
  const queryWords = tokenizeSearchText(query);
  if (queryWords.length === 0) {
    return 0;
  }
  return countExactQueryWordsPrepared(compileSearchField(value).tokenSet, queryWords);
}

export function hasDirectMatch(value: string, queryLowerCase: string): boolean {
  const queryWords = tokenizeSearchText(queryLowerCase);
  if (queryWords.length === 0) {
    return false;
  }
  const tokenSet = compileSearchField(value).tokenSet;
  return queryWords.every((word) => tokenSet.has(word));
}

export function forgeEntryDisplayTitle(entry: ForgeIssueEntry): string {
  return entry.tab.customLabel?.trim() || entry.title;
}

function tabNameSearchText(tab: TabInfo): string {
  return `${tab.customLabel || ""} ${tab.title || ""}`.trim();
}

export function maxExactWordCount(fields: SearchField[], queryWords: string[]): number {
  let best = 0;
  for (const field of fields) {
    const count = countExactQueryWordsPrepared(field.tokenSet, queryWords);
    if (count > best) {
      best = count;
    }
  }
  return best;
}

export function searchDocumentExactWordCount(
  document: SearchDocument,
  queryWords: string[],
): number {
  const fields = document.combinedField
    ? [...document.fields, document.combinedField]
    : document.fields;
  return maxExactWordCount(fields, queryWords);
}

export function searchItemExactWordCount(item: SearchItem, query: string): number {
  const queryWords = tokenizeSearchText(query);
  const documents = buildSearchDocuments([item]);
  return documents[0] ? searchDocumentExactWordCount(documents[0], queryWords) : 0;
}

export function forgeEntryExactWordCount(entry: ForgeIssueEntry, query: string): number {
  const queryWords = tokenizeSearchText(query);
  return maxExactWordCount(compileForgeEntryFields(entry), queryWords);
}

function fieldScore(field: SearchField, query: string, queryWords: string[]): number {
  const match = fuzzyMatchPrepared(field, query, queryWords);
  if (!match.matches) {
    return Number.NEGATIVE_INFINITY;
  }
  const words = countExactQueryWordsPrepared(field.tokenSet, queryWords);
  const direct = queryWords.length > 0 && words >= queryWords.length;
  return match.score + words * 5_000 + (direct ? 10_000 : 0);
}

/**
 * Drops spaces and essential tabs before they are ranked. Each flag is
 * independent, so a surface can hide one section and keep the other.
 */
export function excludePinnedSearchSources(
  tabs: TabInfo[],
  spaces: SpaceInfo[],
  options: { excludeSpaces: boolean; excludeEssentials: boolean },
): { tabs: TabInfo[]; spaces: SpaceInfo[] } {
  return {
    spaces: options.excludeSpaces ? [] : spaces,
    tabs: options.excludeEssentials ? tabs.filter((tab) => !isEssentialTab(tab)) : tabs,
  };
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

export interface NavigatorQuery {
  /** The query starts with one of the column's prefixes, so the column takes the keyboard. */
  active: boolean;
  /** The query with that prefix removed. */
  filterQuery: string;
}

/** Typing one of these first sends the keyboard to the issue navigator. */
export const FORGE_NAVIGATOR_PREFIXES = ["!", "#"] as const;
/** Typing this first sends the keyboard to the todo column. */
export const TODO_NAVIGATOR_PREFIXES = ["@"] as const;

function parseNavigatorQuery(query: string, prefixes: readonly string[]): NavigatorQuery {
  const trimmed = query.trimStart();
  if (prefixes.some((prefix) => trimmed.startsWith(prefix))) {
    return { active: true, filterQuery: trimmed.slice(1).trimStart() };
  }
  return { active: false, filterQuery: query };
}

export function parseForgeNavigatorQuery(query: string): NavigatorQuery {
  return parseNavigatorQuery(query, FORGE_NAVIGATOR_PREFIXES);
}

export function parseTodoNavigatorQuery(query: string): NavigatorQuery {
  return parseNavigatorQuery(query, TODO_NAVIGATOR_PREFIXES);
}

/**
 * Todo tabs that match `query`, best match first. An empty query keeps the
 * column's own order, which already puts the current tab first.
 */
export function filterTodoTabs(todoTabs: TabInfo[], query: string): TabInfo[] {
  if (!query.trim()) {
    return todoTabs;
  }
  return filterSearchItems(
    todoTabs.map((tab) => ({ kind: "tab" as const, data: tab })),
    query,
  ).flatMap((item) => (item.kind === "tab" ? [item.data] : []));
}

export function forgeEntrySearchTexts(entry: ForgeIssueEntry): string[] {
  const texts = [
    forgeEntryDisplayTitle(entry),
    entry.title,
    entry.tab.title || "",
    entry.tab.customLabel || "",
    tabNameSearchText(entry.tab),
    entry.projectLabel,
    entry.ref.id,
    entry.ref.kind.replaceAll("_", " "),
    entry.ref.platform,
  ];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const text of texts) {
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    unique.push(text);
  }
  return unique;
}

function compileForgeEntryFields(entry: ForgeIssueEntry): SearchField[] {
  return forgeEntrySearchTexts(entry).map(compileSearchField);
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
  words: number;
}

function forgeEntryKey(entry: ForgeIssueEntry): string {
  return `${entry.ref.url}:${entry.tab.id ?? ""}:${entry.tab.domId ?? ""}`;
}

export function rankForgeIssueEntries(
  entries: ForgeIssueEntry[],
  query: string,
): RankedForgeIssueEntry[] {
  if (!query.trim()) {
    return entries.map((entry) => ({ entry, score: 0, direct: false, words: 0 }));
  }

  const queryNormalized = normalizeSearchText(query);
  const queryWords = queryNormalized.split(" ").filter(Boolean);
  return entries
    .map((entry) => {
      const fields = compileForgeEntryFields(entry);
      let bestFieldScore = Number.NEGATIVE_INFINITY;
      for (const field of fields) {
        const match = fuzzyMatchPrepared(field, queryNormalized, queryWords);
        if (match.matches && match.score > bestFieldScore) {
          bestFieldScore = match.score;
        }
      }
      const words = maxExactWordCount(fields, queryWords);
      const direct = queryWords.length > 0 && words >= queryWords.length;
      return {
        entry,
        direct,
        words,
        score: bestFieldScore + words * 5_000 + (direct ? 10_000 : 0),
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
  const rankedByKey = new Map(ranked.map((entry) => [forgeEntryKey(entry.entry), entry]));
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
    const rankedEntry = rankedByKey.get(forgeEntryKey(entry));
    const words = rankedEntry?.words ?? 0;
    const score = rankedEntry?.score ?? -1;
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

export interface FilterSearchResult {
  items: SearchItem[];
  bestExactWordCount: number;
}

export function filterSearchDocuments(
  documents: SearchDocument[],
  query: string,
): FilterSearchResult {
  if (!query.trim()) {
    return { items: documents.map((document) => document.item), bestExactWordCount: 0 };
  }

  const queryNormalized = normalizeSearchText(query);
  const queryWords = queryNormalized.split(" ").filter(Boolean);
  const includeUrl = queryNormalized.length >= 2;
  const scored: { item: SearchItem; score: number; words: number }[] = [];

  for (const document of documents) {
    let best = Number.NEGATIVE_INFINITY;
    let matched = false;
    for (const field of document.fields) {
      const score = fieldScore(field, queryNormalized, queryWords);
      if (score > best) {
        best = score;
        matched = true;
      }
    }

    if (!matched && document.combinedField) {
      const combinedScore = fieldScore(document.combinedField, queryNormalized, queryWords);
      if (combinedScore > best) {
        best = combinedScore;
        matched = true;
      }
    }

    if (includeUrl && document.urlField) {
      const urlMatch = fuzzyMatchPrepared(document.urlField, queryNormalized, queryWords);
      if (urlMatch.matches) {
        const urlScore = urlMatch.score;
        if (urlScore > best) {
          best = urlScore;
        }
        matched = true;
      }
    }

    if (!matched || !Number.isFinite(best)) {
      continue;
    }

    if (document.item.kind === "space") {
      best += 300;
    }

    scored.push({
      item: document.item,
      score: best,
      words: searchDocumentExactWordCount(document, queryWords),
    });
  }

  scored.sort((first, second) => second.score - first.score);
  return {
    items: scored.map(({ item }) => item),
    bestExactWordCount: scored.reduce((max, entry) => Math.max(max, entry.words), 0),
  };
}

export function filterSearchItems(items: SearchItem[], query: string): SearchItem[] {
  return filterSearchDocuments(buildSearchDocuments(items), query).items;
}
