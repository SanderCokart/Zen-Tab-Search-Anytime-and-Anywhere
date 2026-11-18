import * as v from "valibot";
import type { ForgeKindFilter } from "@/features/forge/model/forge-filter";
import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";
import type {
  ForgeIssueProjectGroup,
  ForgeIssueProviderGroup,
} from "@/features/search/model/ranking";

/** The groups that were collapsed, by key; disposable UI state. */
export type ForgeCollapsedSet = ReadonlySet<string>;

export const FORGE_COLLAPSED_STORAGE_KEY = "forgeCollapsedGroups";

/** Enough for any real workspace; older keys fall off the front. */
export const MAX_COLLAPSED_GROUPS = 200;

const collapsedGroupsSchema = v.fallback(v.array(v.string()), []);

/** Whatever storage holds, as a list of keys; anything unreadable is "nothing collapsed". */
export function parseCollapsedGroups(value: unknown): string[] {
  return v.parse(collapsedGroupsSchema, value).slice(-MAX_COLLAPSED_GROUPS);
}

export function forgeProjectKey(platform: string, projectLabel: string): string {
  return `project:${platform}:${projectLabel}`;
}

export function forgeIssuesKey(platform: string, projectLabel: string): string {
  return `issues:${platform}:${projectLabel}`;
}

/** Every project, Issues folder and branch folder, in the order the tree draws them. */
export function forgeTreeKeys(providers: readonly ForgeIssueProviderGroup[]): string[] {
  const keys: string[] = [];
  for (const provider of providers) {
    for (const project of provider.projects) {
      keys.push(forgeProjectKey(provider.platform, project.projectLabel));
      if (project.issues.length > 0) {
        keys.push(forgeIssuesKey(provider.platform, project.projectLabel));
      }
      for (const branch of project.branches) {
        keys.push(forgeBranchKey(provider.platform, project.projectLabel, branch.targetBranch));
      }
    }
  }
  return keys;
}

export function forgeBranchKey(
  platform: string,
  projectLabel: string,
  targetBranch: string | undefined,
): string {
  return `branch:${platform}:${projectLabel}:${targetBranch ?? "?"}`;
}

/** Every key an entry sits under, outermost first: project, then Issues or its branch. */
export function forgeGroupKeys(entry: ForgeIssueEntry): {
  project: string;
  folder: string;
} {
  const { platform } = entry.ref;
  return {
    project: forgeProjectKey(platform, entry.projectLabel),
    folder:
      entry.ref.kind === "issue"
        ? forgeIssuesKey(platform, entry.projectLabel)
        : forgeBranchKey(platform, entry.projectLabel, entry.targetBranch),
  };
}

/** The tab the overlay was opened over; a collapsed group still shows its entry. */
export function isCurrentForgeEntry(entry: ForgeIssueEntry): boolean {
  return entry.tab.active === true;
}

/** A closed group's entries: only the current one, which stays in view. */
export function collapsedForgeEntries(
  entries: readonly ForgeIssueEntry[],
  closed: boolean,
): readonly ForgeIssueEntry[] {
  return closed ? entries.filter(isCurrentForgeEntry) : entries;
}

function projectEntries(
  platform: ForgeIssueProviderGroup["platform"],
  project: ForgeIssueProjectGroup,
  collapsed: ForgeCollapsedSet,
): ForgeIssueEntry[] {
  const projectClosed = collapsed.has(forgeProjectKey(platform, project.projectLabel));
  const folders = [
    { key: forgeIssuesKey(platform, project.projectLabel), entries: project.issues },
    ...project.branches.map((branch) => ({
      key: forgeBranchKey(platform, project.projectLabel, branch.targetBranch),
      entries: branch.requests,
    })),
  ];
  // Closed at either level, a group still shows the current entry, and only it.
  return folders.flatMap((folder) =>
    collapsedForgeEntries(folder.entries, projectClosed || collapsed.has(folder.key)),
  );
}

/**
 * The entries a user can see, in the navigator's order: collapsed projects,
 * Issues folders and branch folders contribute only the current entry. Takes the grouped
 * entries so this file needs only the types of `ranking.ts`, which calls it.
 */
/**
 * Groups a `#` or `!` query needs open: the project, and the Issues or
 * request folders of that kind. Stored collapse is left as it was.
 */
export function openedForgeCollapsed(
  collapsed: ForgeCollapsedSet,
  kind: ForgeKindFilter | undefined,
): ForgeCollapsedSet {
  if (!kind) {
    return collapsed;
  }
  const next = new Set<string>();
  for (const key of collapsed) {
    if (key.startsWith("project:")) continue;
    if (kind === "all" || (kind === "issues" && key.startsWith("issues:"))) continue;
    if (kind === "requests" && key.startsWith("branch:")) continue;
    next.add(key);
  }
  return next;
}

export function visibleForgeEntries(
  providers: readonly ForgeIssueProviderGroup[],
  collapsed: ForgeCollapsedSet,
): ForgeIssueEntry[] {
  return providers.flatMap((provider) =>
    provider.projects.flatMap((project) => projectEntries(provider.platform, project, collapsed)),
  );
}

/**
 * Toggles `key` in `collapsed`, returning the new array for storage. The oldest
 * keys are dropped past {@link MAX_COLLAPSED_GROUPS}.
 */
export function toggleCollapsedKey(collapsed: readonly string[], key: string): string[] {
  const next = collapsed.includes(key)
    ? collapsed.filter((item) => item !== key)
    : [...collapsed, key];
  return next.slice(-MAX_COLLAPSED_GROUPS);
}

/**
 * The group a Left key collapses for `entry`: its folder, or, when that is
 * already collapsed, its project. Undefined when both are collapsed.
 */
export function groupToCollapse(
  entry: ForgeIssueEntry,
  collapsed: ForgeCollapsedSet,
): string | undefined {
  const { project, folder } = forgeGroupKeys(entry);
  if (!collapsed.has(folder)) return folder;
  return collapsed.has(project) ? undefined : project;
}

/**
 * The group a Right key expands for `entry`: the outermost collapsed one, so a
 * collapsed project opens before the folder inside it.
 */
export function groupToExpand(
  entry: ForgeIssueEntry,
  collapsed: ForgeCollapsedSet,
): string | undefined {
  const { project, folder } = forgeGroupKeys(entry);
  if (collapsed.has(project)) return project;
  return collapsed.has(folder) ? folder : undefined;
}

/**
 * The collapsed group nearest to the visible entry at `anchor`, for a key that
 * opens it again. Only groups a user can see count: a collapsed folder inside
 * a collapsed project is not one. A group just after the entry beats one just
 * before it.
 */
export function nearestCollapsedGroup(
  providers: readonly ForgeIssueProviderGroup[],
  collapsed: ForgeCollapsedSet,
  anchor: number,
): string | undefined {
  /** Each group with the number of visible entries that come before it. */
  const slots: { key: string; before: number }[] = [];
  let visible = 0;
  for (const provider of providers) {
    for (const project of provider.projects) {
      const projectKey = forgeProjectKey(provider.platform, project.projectLabel);
      if (collapsed.has(projectKey)) {
        slots.push({ key: projectKey, before: visible });
        continue;
      }
      const folders = [
        {
          key: forgeIssuesKey(provider.platform, project.projectLabel),
          size: project.issues.length,
        },
        ...project.branches.map((branch) => ({
          key: forgeBranchKey(provider.platform, project.projectLabel, branch.targetBranch),
          size: branch.requests.length,
        })),
      ];
      for (const folder of folders) {
        if (folder.size === 0) continue;
        if (collapsed.has(folder.key)) slots.push({ key: folder.key, before: visible });
        else visible += folder.size;
      }
    }
  }

  const position = Math.max(0, anchor);
  let best: { key: string; distance: number } | undefined;
  for (const slot of slots) {
    // A group above the entry is one step away when it sits right above it.
    const distance = slot.before <= position ? position - slot.before + 1 : slot.before - position;
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && slot.before > position)
    ) {
      best = { key: slot.key, distance };
    }
  }
  return best?.key;
}
