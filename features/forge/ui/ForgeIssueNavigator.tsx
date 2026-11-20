import { useMemo } from "preact/hooks";
import {
  FORGE_NAVIGATOR_PREFIXES,
  forgeEntryDisplayTitle,
  FORGE_ISSUE_SORT_OPTIONS,
  groupForgeIssueEntries,
  type ForgeIssueSortMode,
} from "@/features/search/model/ranking";
import {
  forgeBranchKey,
  forgeIssuesKey,
  forgeProjectKey,
  isCurrentForgeEntry,
} from "@/features/forge/model/forge-collapse";
import type { ForgeKindCounts, ForgeKindFilter } from "@/features/forge/model/forge-filter";
import { forgeRowParts, type ForgeRowTag } from "@/features/forge/model/forge-label";
import { PrefixHint } from "@/features/search/ui/components/PrefixHint";
import { TabActions } from "@/features/search/ui/components/TabActions";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import { tabActionFlags } from "@/features/settings/model/complexity";
import { formatForgeEntryDate, formatShortAge } from "@/features/search/ui/lib/format";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";
import {
  countMovableForgeTabs,
  type ForgeOrganizeMode,
} from "@/features/forge/model/forge-tab-organize";
import {
  forgeBranchFolderName,
  forgeProjectHomeUrl,
  forgeRequestsFolderName,
  formatForgePlatform,
} from "@/features/forge/model/forge-label";
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
import { NowTag } from "@/features/search/ui/components/NowTag";
import { CollapseAllButton } from "@/shared/ui/primitives/CollapseAllButton";
import { TreeNode } from "@/shared/ui/primitives/TreeNode";
import { Segmented } from "@/shared/ui/primitives/Segmented";
import { TipHint, TruncatedTip } from "@/shared/ui/primitives/Tooltip";
import { ChevronDownIcon } from "@/shared/ui/primitives/ChevronDownIcon";
import { scrollIntoViewWhen } from "@/shared/ui/lib/scroll-into-view";
import { OrganizeForgeMenu } from "@/features/forge/ui/components/OrganizeForgeMenu";

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
  onOpenProject,
  onSelect,
  onSortChange,
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
  displaySettings,
  onOrganize,
  onConfirmOrganizeChange,
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
  /** Opens the repository homepage for this project. */
  onOpenProject?: (url: string) => void;
  onSelect: (index: number) => void;
  onSortChange: (mode: ForgeIssueSortMode) => void;
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
  displaySettings?: DisplaySettings;
  onOrganize?: (mode: ForgeOrganizeMode) => void;
  onConfirmOrganizeChange?: (confirm: boolean) => void;
}) {
  const providers = useMemo(() => groupForgeIssueEntries(entries, sortMode), [entries, sortMode]);
  // Index once instead of an indexOf scan per rendered row.
  const entryIndices = useMemo(
    () => new Map(keyboardEntries.map((entry, index) => [entry, index])),
    [keyboardEntries],
  );
  const count = entries.length;

  const renderEntries = (groupEntries: readonly ForgeIssueEntry[]) => (
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
              "[--zen-row-pad-y:var(--zen-issue-pad)]",
              statusRowClass(light, selected),
            )}
            data-testid="zen-issue-entry"
            data-issue-url={entry.ref.url}
            data-status-light={light}
            data-issue-selected={selected ? "true" : undefined}
            data-current={isCurrentForgeEntry(entry) ? "true" : undefined}
            data-gap-pad=""
            ref={scrollIntoViewWhen(selected)}
            onContextMenu={(event) => onContextMenu(entry.tab, event)}
          >
            <div class="zs-row-line flex min-h-[var(--zen-row-height)] min-w-0 items-center pl-[var(--zen-row-pad)]">
              <button
                type="button"
                data-testid="zen-issue-activate"
                class="flex h-full min-h-[var(--zen-row-height)] min-w-0 flex-1 cursor-pointer items-center gap-[var(--zen-space-3)] overflow-hidden border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
                onClick={() => onActivate(entry)}
                onFocus={() => onSelect(entryIndex)}
              >
                <span class={cn(TAG_BASE_CLASS, TAG_CLASS[parts.tag])}>{parts.tag}</span>
                <span class="text-zen-muted shrink-0 font-mono text-[length:var(--zen-text-sm)]">
                  {parts.ref}
                </span>
                <TruncatedTip
                  class={cn("zs-row-title", entryTextClass(truncate))}
                  truncate={truncate}
                  text={parts.title}
                />
                {isCurrentForgeEntry(entry) && <NowTag />}
                <span class="zs-meta">
                  {timer && displaySettings?.timers !== false && (
                    <span class="zs-meta-timer zs-digits">
                      <TimerCountdown endAt={timer.endAt} format="short" />
                    </span>
                  )}
                  {entryDate && lastOpenedAt !== undefined && (
                    <TipHint
                      class="zs-digits"
                      label={`${entryDate.label}: ${entryDate.absolute}`}
                      text={`${entryDate.label}: ${entryDate.absolute}`}
                    >
                      {formatShortAge(Date.now() - lastOpenedAt)}
                    </TipHint>
                  )}
                </span>
                {isTodo && <Led on class="zs-todo-dot" />}
              </button>
            </div>
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
              actions={displaySettings ? tabActionFlags(displaySettings) : undefined}
            />
            {timerOpen && displaySettings?.timers !== false && tabId !== undefined && (
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
      <aside class="zs-card flex min-h-0 min-w-0 flex-1 flex-col p-[var(--zen-space-5)]">
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
          <span class="text-zen-danger flex shrink-0 items-center gap-[var(--zen-space-1)]">
            <span class="relative inline-flex items-center">
              <select
                class="zs-key text-zen-danger hover:text-zen-text h-[var(--zen-mini-key)] appearance-none py-0 pr-[calc(var(--zen-icon-sm)+var(--zen-space-4))] pl-[var(--zen-space-3)] font-[inherit] text-[length:var(--zen-text-sm)] leading-none tracking-[0.04em] uppercase"
                aria-label="Change issue sorting"
                data-testid="zen-forge-sort"
                value={sortMode}
                onChange={(event) => onSortChange(event.currentTarget.value as ForgeIssueSortMode)}
              >
                {FORGE_ISSUE_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon class="pointer-events-none absolute right-[var(--zen-space-2)] h-[var(--zen-icon-sm)] w-[var(--zen-icon-sm)]" />
            </span>
            <span aria-hidden="true">· {count}</span>
          </span>
        </div>
        <div class="mb-[var(--zen-space-5)] grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--zen-space-2)]">
          <Segmented<ForgeKindFilter>
            class="min-w-0"
            label="Show"
            value={kindFilter}
            onChange={onKindFilterChange}
            options={[
              { value: "all", label: "All", count: kindCounts.all },
              { value: "issues", label: "Issues", count: kindCounts.issues },
              { value: "requests", label: requestsLabel, count: kindCounts.requests },
            ]}
          />
          {onOrganize && (
            <OrganizeForgeMenu
              tabCount={countMovableForgeTabs(entries)}
              confirm={displaySettings?.confirmOrganizeForgeTabs !== false}
              onOrganize={onOrganize}
              onConfirmChange={onConfirmOrganizeChange}
            />
          )}
        </div>
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
                        const folderPrefix = forgeRequestsFolderName(platform);
                        const folders = [
                          ...(project.issues.length > 0
                            ? [
                                {
                                  key: forgeIssuesKey(platform, project.projectLabel),
                                  label: "Issues",
                                  chip: undefined,
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
                              : forgeBranchFolderName(),
                            entries: branch.requests,
                          })),
                        ];
                        const projectKey = forgeProjectKey(platform, project.projectLabel);
                        const projectOpen = !collapsed.has(projectKey);
                        const homeRef =
                          project.issues[0]?.ref ?? project.branches[0]?.requests[0]?.ref;
                        const homeUrl = homeRef ? forgeProjectHomeUrl(homeRef) : undefined;
                        // Closed, the project still shows the current entry, and only
                        // it, under its folder's header, as a closed tab folder does.
                        const peekFolders = projectOpen
                          ? []
                          : folders.filter((folder) => folder.entries.some(isCurrentForgeEntry));
                        const renderFolder = (folder: (typeof folders)[number], inPeek = false) => {
                          const open = !inPeek && !collapsed.has(folder.key);
                          const current = open ? [] : folder.entries.filter(isCurrentForgeEntry);
                          return (
                            <TreeNode
                              key={folder.key}
                              data-testid="zen-issue-folder"
                              label={folder.label}
                              chip={folder.chip}
                              open={open}
                              // Drawn closed inside a closed project: opening it opens the project.
                              onToggle={() => onToggleGroup(inPeek ? projectKey : folder.key)}
                              count={folder.entries.length}
                              peek={current.length > 0 ? renderEntries(current) : undefined}
                            >
                              {renderEntries(
                                current.length > 0
                                  ? folder.entries.filter((entry) => !isCurrentForgeEntry(entry))
                                  : folder.entries,
                              )}
                            </TreeNode>
                          );
                        };
                        return (
                          <TreeNode
                            key={project.projectLabel}
                            prefix={`${formatForgePlatform(platform)} · `}
                            label={project.projectLabel}
                            open={projectOpen}
                            onToggle={() => onToggleGroup(projectKey)}
                            onOpen={
                              onOpenProject && homeUrl ? () => onOpenProject(homeUrl) : undefined
                            }
                            openLabel={homeUrl ? `Open ${project.projectLabel}` : undefined}
                            count={folders.reduce(
                              (total, folder) => total + folder.entries.length,
                              0,
                            )}
                            peek={
                              peekFolders.length > 0
                                ? peekFolders.map((folder) => renderFolder(folder, true))
                                : undefined
                            }
                            led
                          >
                            {folders
                              .filter((folder) => !peekFolders.includes(folder))
                              .map((folder) => renderFolder(folder))}
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
