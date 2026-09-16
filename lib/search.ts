import { parseForgeUrl, cleanForgeTitle } from "./forge-label";
import {
  isUsableTabId,
  type ForgeIssueEntry,
  type SearchItem,
  type SpaceInfo,
  type TabInfo,
} from "./types";

export type ForgeIssueSortMode = "recent" | "old";

interface FuzzyMatch {
  matches: boolean;
  score: number;
}

export function fuzzyMatchWithScore(str: string, queryLowerCase: string): FuzzyMatch {
  const normalized = str.toLowerCase();
  let strIndex = 0;
  const matchPositions: number[] = [];

  for (let queryIndex = 0; queryIndex < queryLowerCase.length; queryIndex++) {
    const char = queryLowerCase[queryIndex];
    if (char === undefined) {
      return { matches: false, score: 0 };
    }
    const found = normalized.indexOf(char, strIndex);

    if (found === -1) {
      return { matches: false, score: 0 };
    }

    matchPositions.push(found);
    strIndex = found + 1;
  }

  let score = 0;

  if (normalized.includes(queryLowerCase)) {
    score += 1000;
    const queryIndex = normalized.indexOf(queryLowerCase);
    if (queryIndex === 0 || /\s/.test(normalized[queryIndex - 1] ?? "")) {
      score += 500;
    }
  }

  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(queryLowerCase)) {
      score += 200;
    } else if (word.includes(queryLowerCase)) {
      score += 100;
    }
  }

  let consecutiveBonus = 0;
  for (let i = 1; i < matchPositions.length; i++) {
    const current = matchPositions[i];
    const previous = matchPositions[i - 1];
    if (current !== undefined && previous !== undefined && current === previous + 1) {
      consecutiveBonus += 50;
    }
  }
  score += consecutiveBonus;

  const firstMatchPosition = matchPositions[0] ?? 0;
  score += Math.max(0, 100 - firstMatchPosition * 2);
  score += Math.max(0, 200 - normalized.length);

  const lastMatchPosition = matchPositions[matchPositions.length - 1] ?? firstMatchPosition;
  const matchSpan = lastMatchPosition - firstMatchPosition + 1;
  score += Math.max(0, 100 - matchSpan);

  return { matches: true, score };
}

export function buildSearchItems(allTabs: TabInfo[], allSpaces: SpaceInfo[]): SearchItem[] {
  const items: SearchItem[] = allSpaces.map((space) => ({ kind: "space", data: space }));
  for (const tab of allTabs) {
    items.push({ kind: "tab", data: tab });
  }
  return items;
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

export function filterForgeIssueEntries(
  entries: ForgeIssueEntry[],
  query: string,
): ForgeIssueEntry[] {
  if (!query.trim()) {
    return entries;
  }

  const queryLowerCase = query.toLowerCase();
  return entries
    .map((entry) => {
      const matches = [
        fuzzyMatchWithScore(entry.title, queryLowerCase),
        fuzzyMatchWithScore(entry.projectLabel, queryLowerCase),
        fuzzyMatchWithScore(entry.ref.id, queryLowerCase),
        fuzzyMatchWithScore(entry.ref.kind.replace("_", " "), queryLowerCase),
        fuzzyMatchWithScore(entry.ref.platform, queryLowerCase),
      ];
      return {
        entry,
        score: Math.max(
          ...matches.filter((match) => match.matches).map((match) => match.score),
          -1,
        ),
      };
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
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
  if (!isUsableTabId(currentTabId)) {
    const current = items.find((item) => item.kind === "tab" && item.data.active);
    if (!current) {
      return items;
    }
    return [current, ...items.filter((item) => item !== current)];
  }

  const index = items.findIndex((item) => item.kind === "tab" && item.data.id === currentTabId);
  if (index <= 0) {
    return items;
  }

  const current = items[index];
  if (!current) {
    return items;
  }
  return [current, ...items.slice(0, index), ...items.slice(index + 1)];
}

export function filterSearchItems(items: SearchItem[], query: string): SearchItem[] {
  if (!query) {
    return items;
  }

  const queryLowerCase = query.toLowerCase();
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
          score: Math.max(nameMatch.score, iconMatch.score) + 300,
        },
      });
      continue;
    }

    const labelMatch = fuzzyMatchWithScore(item.data.customLabel || "", queryLowerCase);
    const titleMatch = fuzzyMatchWithScore(item.data.title || "", queryLowerCase);
    const urlMatch = fuzzyMatchWithScore(item.data.url || "", queryLowerCase);
    const workspaceMatch = fuzzyMatchWithScore(item.data.workspaceName || "", queryLowerCase);
    if (
      !labelMatch.matches &&
      !titleMatch.matches &&
      !urlMatch.matches &&
      !workspaceMatch.matches
    ) {
      continue;
    }

    scored.push({
      kind: "tab",
      data: {
        ...item.data,
        score: Math.max(labelMatch.score, titleMatch.score, urlMatch.score, workspaceMatch.score),
      },
    });
  }

  return scored.sort((a, b) => (b.data.score ?? 0) - (a.data.score ?? 0));
}
