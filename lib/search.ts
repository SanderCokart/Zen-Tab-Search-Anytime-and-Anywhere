import { isUsableTabId, type SearchItem, type SpaceInfo, type TabInfo } from "./types";

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
