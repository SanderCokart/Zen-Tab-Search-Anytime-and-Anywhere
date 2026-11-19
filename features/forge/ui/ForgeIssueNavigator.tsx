import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
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
  isCurrentForgeEntry,
} from "@/features/forge/model/forge-collapse";
import type { ForgeKindCounts, ForgeKindFilter } from "@/features/forge/model/forge-filter";
import { forgeRowParts, type ForgeRowTag } from "@/features/forge/model/forge-label";
import { PrefixHint } from "@/features/search/ui/components/PrefixHint";
import { TabActions } from "@/features/search/ui/components/TabActions";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import { tabActionFlags } from "@/features/settings/model/complexity";
import { formatForgeEntryDate, formatShortAge } from "@/features/search/ui/lib/format";
import { useCloseOnOutsideClick } from "@/features/search/ui/hooks/useCloseOnOutsideClick";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";
import {
  countMovableForgeTabs,
  organizeForgeConfirmMessage,
  organizeForgePreviewTree,
  type ForgeOrganizeMode,
} from "@/features/forge/model/forge-tab-organize";
import { forgeProjectHomeUrl, formatForgePlatform } from "@/features/forge/model/forge-label";
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
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import {
  TOOLTIP_DELAY_MS,
  TooltipLegend,
  TruncatedTip,
  useTooltip,
} from "@/shared/ui/primitives/Tooltip";

/** The outlined ISSUE / MR / PR tag; `TAG_CLASS` adds its colour. */
export const TAG_BASE_CLASS =
  "shrink-0 rounded-[calc(var(--zen-radius)*0.5)] border px-[calc(var(--zen-font-size)*0.43)] py-[calc(var(--zen-font-size)*0.1)] font-mono text-[length:var(--zen-text-xs)] leading-tight font-semibold tracking-[0.1em]";

export const TAG_CLASS: Record<ForgeRowTag, string> = {
  ISSUE: "border-zen-line text-zen-subtle",
  MR: "border-[color-mix(in_srgb,var(--zs-red)_40%,transparent)] text-zen-danger",
  PR: "border-[color-mix(in_srgb,var(--zs-red)_40%,transparent)] text-zen-danger",
  EPIC: "border-zen-text bg-zen-text text-zen-raised",
};

/** Lucide Boxes: stacked cartons, for folding tabs into folders. */
function OrganizeBoxesIcon({ class: className }: { class?: string }) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
      <path d="m7 16.5-4.74-2.85" />
      <path d="m7 16.5 5-3" />
      <path d="M7 16.5v5.17" />
      <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
      <path d="m17 16.5-5-3" />
      <path d="m17 16.5 4.74-2.85" />
      <path d="M17 16.5v5.17" />
      <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <path d="M12 8 7.26 5.15" />
      <path d="m12 8 4.74-2.85" />
      <path d="M12 13.5V8" />
    </svg>
  );
}

function OrganizeForgeMenu({
  tabCount,
  confirm,
  onOrganize,
  onConfirmChange,
}: {
  tabCount: number;
  confirm: boolean;
  onOrganize: (mode: ForgeOrganizeMode) => void;
  onConfirmChange?: (confirm: boolean) => void;
}) {
  const [pending, setPending] = useState<ForgeOrganizeMode | null>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ForgeOrganizeMode | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const dontAskRef = useRef(false);
  const previewTimer = useRef<number>(undefined);
  const disabled = tabCount === 0;
  useCloseOnOutsideClick(open, "[data-testid='zen-organize-forge-wrap']", () => setOpen(false));

  const showPreview = (mode: ForgeOrganizeMode) => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreview(mode), TOOLTIP_DELAY_MS);
  };
  const hidePreview = () => {
    window.clearTimeout(previewTimer.current);
    setPreview(null);
  };
  useEffect(() => () => window.clearTimeout(previewTimer.current), []);

  const choose = (mode: ForgeOrganizeMode) => {
    if (confirm) {
      dontAskRef.current = false;
      setDontAsk(false);
      setPending(mode);
      return;
    }
    onOrganize(mode);
  };

  const runPending = () => {
    if (pending === null) {
      return;
    }
    if (dontAskRef.current) {
      onConfirmChange?.(false);
    }
    onOrganize(pending);
    setPending(null);
  };

  return (
    <>
      <span
        class="relative inline-flex shrink-0 items-center"
        data-testid="zen-organize-forge-wrap"
      >
        <TooltipButton
          label="Organize issue tabs into folders"
          tooltip="Put open issue tabs into matching Zen folders"
          data-testid="zen-organize-forge"
          class={cn(
            "zs-key relative inline-flex shrink-0 items-center justify-center p-0 font-[inherit]",
            "h-[calc(var(--zen-font-size)*2.286+var(--zen-space-1)*2)] w-[calc(var(--zen-font-size)*2.286+var(--zen-space-1)*2)]",
            "rounded-[var(--zs-r-seg)]",
          )}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <OrganizeBoxesIcon class="size-[var(--zen-icon-md)]" />
        </TooltipButton>
        {open && (
          <div
            class={cn(
              "zs-menu absolute top-full right-0 z-50 mt-[var(--zen-space-2)]",
              "flex min-w-[calc(var(--zen-font-size)*12)] flex-col p-[var(--zen-space-1)]",
            )}
            data-testid="zen-organize-forge-menu"
            role="menu"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseLeave={hidePreview}
          >
            {(
              [
                {
                  mode: "tree",
                  label: "As in this list",
                  testId: "zen-organize-forge-tree",
                },
                {
                  mode: "byIssue",
                  label: "Group with issues",
                  testId: "zen-organize-forge-by-issue",
                },
              ] as const
            ).map((option) => (
              <button
                key={option.mode}
                type="button"
                role="menuitem"
                data-testid={option.testId}
                class="zs-label text-zen-subtle hover:text-zen-text cursor-pointer border-0 bg-transparent px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-left font-[inherit]"
                onMouseEnter={() => showPreview(option.mode)}
                onFocus={() => showPreview(option.mode)}
                onBlur={hidePreview}
                onClick={() => {
                  hidePreview();
                  setOpen(false);
                  choose(option.mode);
                }}
              >
                {option.label}
              </button>
            ))}
            {preview && (
              <div
                class={cn(
                  "zs-lcd pointer-events-none absolute top-0 right-full mr-[var(--zen-space-2)]",
                  "px-[var(--zen-space-3)] py-[var(--zen-space-2)]",
                )}
                data-testid="zen-organize-forge-preview"
                role="tooltip"
              >
                <pre class="m-0 font-mono text-[length:var(--zen-text-xs)] leading-snug font-normal tracking-normal whitespace-pre normal-case">
                  {organizeForgePreviewTree(preview)}
                </pre>
              </div>
            )}
          </div>
        )}
      </span>
      {pending !== null && tabCount > 0 && (
        <div
          class="zs-well col-span-full flex min-w-0 flex-col gap-[var(--zen-space-2)] rounded-[var(--zs-r-lcd)] p-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]"
          role="alertdialog"
          aria-label="Confirm organizing issue tabs"
          data-testid="zen-organize-forge-confirm"
        >
          <span class="min-w-0">{organizeForgeConfirmMessage(pending, tabCount)}</span>
          <label class="text-zen-subtle flex min-w-0 items-center gap-[var(--zen-space-2)]">
            <input
              type="checkbox"
              class="accent-[var(--zen-text)]"
              data-testid="zen-organize-forge-dont-ask"
              checked={dontAsk}
              onChange={(event) => {
                dontAskRef.current = event.currentTarget.checked;
                setDontAsk(event.currentTarget.checked);
              }}
            />
            Don&apos;t ask this again
          </label>
          <span class="flex shrink-0 items-center justify-end gap-[var(--zen-space-2)]">
            <button
              type="button"
              class="zs-key zs-key-red px-[var(--zen-space-2)] font-[inherit] text-[length:var(--zen-text-sm)]"
              data-own-sound=""
              data-testid="zen-organize-forge-confirm-button"
              onClick={runPending}
            >
              Organize
            </button>
            <button
              type="button"
              class="text-zen-subtle hover:text-zen-text cursor-pointer border-0 bg-transparent px-[var(--zen-space-1)] font-[inherit] text-[length:var(--zen-text-sm)] hover:underline"
              data-testid="zen-organize-forge-cancel-button"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </span>
        </div>
      )}
    </>
  );
}

function ForgeDateHint({
  label,
  absolute,
  children,
}: {
  label: string;
  absolute: string;
  children: ComponentChildren;
}) {
  const tooltip = useTooltip();
  return (
    <>
      <span
        class="zs-digits"
        aria-label={`${label}: ${absolute}`}
        onMouseEnter={(event) => tooltip.showAfterPause(event.currentTarget)}
        onMouseLeave={tooltip.hide}
        onFocus={(event) => tooltip.show(event.currentTarget)}
        onBlur={tooltip.hide}
        onClick={tooltip.hide}
        tabIndex={0}
      >
        {children}
      </span>
      {tooltip.anchor && (
        <TooltipLegend content={`${label}: ${absolute}`} anchor={tooltip.anchor} />
      )}
    </>
  );
}

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
            ref={(element) => {
              if (selected) {
                element?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }
            }}
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
                {isTodo && <Led on class="zs-todo-dot" />}
                <span class="zs-meta">
                  {timer && displaySettings?.timers !== false && (
                    <span class="zs-meta-timer zs-digits">
                      <TimerCountdown endAt={timer.endAt} format="short" />
                    </span>
                  )}
                  {entryDate && lastOpenedAt !== undefined && (
                    <ForgeDateHint label={entryDate.label} absolute={entryDate.absolute}>
                      {formatShortAge(Date.now() - lastOpenedAt)}
                    </ForgeDateHint>
                  )}
                </span>
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
          <TooltipButton
            label="Change issue sorting"
            class="text-zen-danger shrink-0 cursor-pointer border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] uppercase"
            onClick={onToggleSort}
          >
            {sortMode === "recent" ? "Recent" : "Old"} · {count}
          </TooltipButton>
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
                        const folderPrefix = platform === "github" ? "PRs" : "MRs";
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
                              : "target unknown",
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
