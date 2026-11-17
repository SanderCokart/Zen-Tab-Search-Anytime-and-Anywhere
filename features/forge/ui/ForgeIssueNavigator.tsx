import { useMemo } from "preact/hooks";
import {
  FORGE_NAVIGATOR_PREFIXES,
  forgeEntryDisplayTitle,
  groupForgeIssueEntries,
  type ForgeIssueSortMode,
} from "@/features/search/model/ranking";
import {
  forgeBranchKey,
  forgeIssuesKey,
  forgeProjectKey,
} from "@/features/forge/model/forge-collapse";
import type { ForgeKindCounts, ForgeKindFilter } from "@/features/forge/model/forge-filter";
import { forgeRowParts, type ForgeRowTag } from "@/features/forge/model/forge-label";
import { PrefixHint } from "@/features/search/ui/components/PrefixHint";
import { TabActions } from "@/features/search/ui/components/TabActions";
import { formatForgeEntryDate, formatShortAge } from "@/features/search/ui/lib/format";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";
import { formatForgePlatform } from "@/features/forge/model/forge-label";
import { TimerCountdown } from "@/features/timers/ui/TimerCountdown";
import { TimerForm } from "@/features/timers/ui/TimerForm";
import { statusRowClass } from "@/features/status/ui/traffic-light";
import {
  tabBrowserId,
  type TabInfo,
  type TabTimer,
  type TabTodo,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";
import { Led } from "@/shared/ui/primitives/Led";
import { CollapseAllButton } from "@/shared/ui/primitives/CollapseAllButton";
import { TreeNode } from "@/shared/ui/primitives/TreeNode";
import { Segmented } from "@/shared/ui/primitives/Segmented";

/** The outlined ISSUE / MR / PR tag; `TAG_CLASS` adds its colour. */
export const TAG_BASE_CLASS =
  "shrink-0 rounded-[calc(var(--zen-radius)*0.5)] border px-[calc(var(--zen-font-size)*0.43)] py-[calc(var(--zen-font-size)*0.1)] font-mono text-[length:var(--zen-text-xs)] leading-tight font-semibold tracking-[0.1em]";

export const TAG_CLASS: Record<ForgeRowTag, string> = {
  ISSUE: "border-zen-line text-zen-subtle",
  MR: "border-[color-mix(in_srgb,var(--zs-red)_40%,transparent)] text-zen-danger",
  PR: "border-[color-mix(in_srgb,var(--zs-red)_40%,transparent)] text-zen-danger",
  EPIC: "border-zen-text bg-zen-text text-zen-raised",
};

export function ForgeIssueNavigator({
  entries,
  truncate,
  sortMode,
  keyboardEntries,
  kindFilter,
  kindCounts,
  requestsLabel,
  onKindFilterChange,
  collapsed,
  onToggleGroup,
  allCollapsed = false,
  onToggleAll,
  selectedIndex,
  onActivate,
  onSelect,
  onToggleSort,
  onContextMenu,
  timers,
  todos,
  timerTabId,
  onToggleTodo,
  onToggleTimerForm,
  onOpenTimerPopup,
  onSetTimer,
  onClearTimer,
  statuses,
  statusMenuTabId,
  onOpenStatusMenu,
}: {
  entries: ForgeIssueEntry[];
  truncate: boolean;
  sortMode: ForgeIssueSortMode;
  /** The entries in arrow-key order: only the visible ones, so collapsed groups have no index. */
  keyboardEntries: ForgeIssueEntry[];
  kindFilter: ForgeKindFilter;
  /** What the query left, per kind, before `kindFilter` narrows it. */
  kindCounts: ForgeKindCounts;
  /** "PRs" when every entry is a GitHub one, otherwise "MRs". */
  requestsLabel: string;
  onKindFilterChange: (filter: ForgeKindFilter) => void;
  /** Keys of the collapsed groups; see `forge-collapse.ts`. */
  collapsed: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  /** True when every project and folder is collapsed. */
  allCollapsed?: boolean;
  /** Collapses every group, or expands them when they already are. Left out, no button. */
  onToggleAll?: () => void;
  selectedIndex: number;
  onActivate: (entry: ForgeIssueEntry) => void;
  onSelect: (index: number) => void;
  onToggleSort: () => void;
  /** Right-click on an entry opens the context menu for its tab. */
  onContextMenu: (tab: TabInfo, event: MouseEvent) => void;
  timers: Map<number, TabTimer>;
  todos: Map<number, TabTodo>;
  /** The tab whose timer form is open, if any. */
  timerTabId: number | null;
  onToggleTodo: (tabId: number) => void;
  onToggleTimerForm: (tabId: number) => void;
  onOpenTimerPopup: (tabId: number) => void;
  onSetTimer: (tabId: number, endAt: number) => void;
  onClearTimer: (tabId: number) => void;
  statuses: Map<number, TrafficLight>;
  /** The tab whose status menu is open, if any. */
  statusMenuTabId: number | null;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
}) {
  const providers = useMemo(() => groupForgeIssueEntries(entries, sortMode), [entries, sortMode]);
  // Index once instead of an indexOf scan per rendered row.
  const entryIndices = useMemo(
    () => new Map(keyboardEntries.map((entry, index) => [entry, index])),
    [keyboardEntries],
  );
  const count = entries.length;

  const renderEntries = (groupEntries: ForgeIssueEntry[]) => (
    <div class="flex min-w-0 flex-col gap-[var(--zen-issue-gap)]">
      {groupEntries.map((entry) => {
        const entryIndex = entryIndices.get(entry) ?? -1;
        // A collapsed entry has no keyboard index; -1 must not match "nothing selected".
        const selected = entryIndex >= 0 && selectedIndex === entryIndex;
        const tabId = tabBrowserId(entry.tab);
        const timer = timers.get(tabId ?? -1);
        const timerOpen = tabId !== undefined && timerTabId === tabId;
        const light = tabId === undefined ? undefined : statuses.get(tabId);
        const entryDate = formatForgeEntryDate(entry);
        const parts = forgeRowParts(entry.ref, forgeEntryDisplayTitle(entry));
        const lastOpenedAt = entry.tab.lastOpenedAt;
        const isTodo = todos.has(tabId ?? -1);
        return (
          <div
            key={`${entry.ref.url}:${entry.tab.id ?? entry.tab.domId ?? entry.title}`}
            class={cn(
              "zs-row flex w-full max-w-full min-w-0 flex-col rounded-[var(--zen-radius)]",
              statusRowClass(light, selected),
            )}
            data-testid="zen-issue-entry"
            data-status-light={light}
            data-issue-selected={selected ? "true" : undefined}
            ref={(element) => {
              if (selected) {
                element?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }
            }}
            onContextMenu={(event) => onContextMenu(entry.tab, event)}
          >
            <div class="flex min-h-[var(--zen-row-height)] min-w-0 items-center px-[var(--zen-row-pad)]">
              <button
                type="button"
                class="flex h-full min-h-[var(--zen-row-height)] min-w-0 flex-1 cursor-pointer items-center gap-[var(--zen-space-3)] overflow-hidden border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
                onClick={() => onActivate(entry)}
                onFocus={() => onSelect(entryIndex)}
                title={entry.ref.url}
              >
                <span class={cn(TAG_BASE_CLASS, TAG_CLASS[parts.tag])}>{parts.tag}</span>
                <span class="text-zen-muted shrink-0 font-mono text-[length:var(--zen-text-sm)]">
                  {parts.ref}
                </span>
                <span class={cn("zs-row-title", entryTextClass(truncate))}>{parts.title}</span>
                {isTodo && <Led on class="zs-todo-dot" />}
                <span class="zs-meta">
                  {timer && (
                    <span class="zs-meta-timer zs-digits">
                      <TimerCountdown endAt={timer.endAt} format="short" />
                    </span>
                  )}
                  {entryDate && lastOpenedAt !== undefined && (
                    <span class="zs-digits" title={`${entryDate.label}: ${entryDate.absolute}`}>
                      {formatShortAge(Date.now() - lastOpenedAt)}
                    </span>
                  )}
                </span>
              </button>
              <TabActions
                tab={entry.tab}
                timer={timer}
                timerOpen={timerOpen}
                isTodo={isTodo}
                light={light}
                statusMenuOpen={tabId !== undefined && statusMenuTabId === tabId}
                onOpenStatusMenu={onOpenStatusMenu}
                onToggleTodo={onToggleTodo}
                onToggleTimer={onToggleTimerForm}
                onOpenTimerPopup={onOpenTimerPopup}
              />
            </div>
            {timerOpen && tabId !== undefined && (
              <div class="px-[var(--zen-row-pad)] pb-[var(--zen-space-2)]">
                <TimerForm
                  compact
                  timer={timer}
                  onSet={(endAt) => onSetTimer(tabId, endAt)}
                  onClear={() => onClearTimer(tabId)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <aside class="zs-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-[var(--zen-space-5)]">
        <div class="zs-head">
          <PrefixHint prefixes={FORGE_NAVIGATOR_PREFIXES} column="issues and requests" />
          <strong class="min-w-0 truncate font-[inherit] font-medium">Issues and requests</strong>
          {onToggleAll ? (
            <span class="zs-head-split">
              <span class="zs-head-rule" aria-hidden="true" />
              <CollapseAllButton
                collapsed={allCollapsed}
                onToggle={onToggleAll}
                testId="zen-collapse-issues"
              />
              <span class="zs-head-rule" aria-hidden="true" />
            </span>
          ) : (
            <span class="zs-head-rule" aria-hidden="true" />
          )}
          <button
            type="button"
            class="text-zen-danger shrink-0 cursor-pointer border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] uppercase"
            onClick={onToggleSort}
            title="Change issue sorting"
          >
            {sortMode === "recent" ? "Recent" : "Old"} · {count}
          </button>
        </div>
        <Segmented<ForgeKindFilter>
          class="mb-[var(--zen-space-5)]"
          label="Show"
          value={kindFilter}
          onChange={onKindFilterChange}
          options={[
            { value: "all", label: "All", count: kindCounts.all },
            { value: "issues", label: "Issues", count: kindCounts.issues },
            { value: "requests", label: requestsLabel, count: kindCounts.requests },
          ]}
        />
        <div class="zen-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {providers.length === 0 ? (
            <p class="text-zen-muted m-0 py-[var(--zen-space-3)] text-center text-[length:var(--zen-text-sm)]">
              No matching issues or requests.
            </p>
          ) : (
            <div class="flex min-w-0 flex-col gap-[var(--zen-space-5)]">
              {providers.map(({ platform, projects }) => {
                return (
                  <section key={platform} class="min-w-0">
                    <div class="flex min-w-0 flex-col gap-[var(--zen-space-5)]">
                      {projects.map((project) => {
                        const folderPrefix = platform === "github" ? "PRs" : "MRs";
                        const folders = [
                          ...(project.issues.length > 0
                            ? [
                                {
                                  key: forgeIssuesKey(platform, project.projectLabel),
                                  label: "Issues",
                                  chip: undefined,
                                  title: "Issues",
                                  entries: project.issues,
                                },
                              ]
                            : []),
                          ...project.branches.map((branch) => ({
                            key: forgeBranchKey(
                              platform,
                              project.projectLabel,
                              branch.targetBranch,
                            ),
                            label: folderPrefix,
                            chip: branch.targetBranch
                              ? `→ ${branch.targetBranch}`
                              : "target unknown",
                            title: branch.targetBranch
                              ? `${folderPrefix} → ${branch.targetBranch}`
                              : `${folderPrefix} · target unknown`,
                            entries: branch.requests,
                          })),
                        ];
                        const projectKey = forgeProjectKey(platform, project.projectLabel);
                        return (
                          <TreeNode
                            key={project.projectLabel}
                            prefix={`${formatForgePlatform(platform)} · `}
                            label={project.projectLabel}
                            title={project.projectLabel}
                            open={!collapsed.has(projectKey)}
                            onToggle={() => onToggleGroup(projectKey)}
                            count={folders.reduce(
                              (total, folder) => total + folder.entries.length,
                              0,
                            )}
                            led
                          >
                            {folders.map((folder) => (
                              <TreeNode
                                key={folder.key}
                                data-testid="zen-issue-folder"
                                label={folder.label}
                                chip={folder.chip}
                                title={folder.title}
                                open={!collapsed.has(folder.key)}
                                onToggle={() => onToggleGroup(folder.key)}
                                count={folder.entries.length}
                              >
                                {renderEntries(folder.entries)}
                              </TreeNode>
                            ))}
                          </TreeNode>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
