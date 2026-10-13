import { useMemo } from "preact/hooks";
import {
  flattenForgeNavigatorEntries,
  forgeEntryDisplayTitle,
  groupForgeIssueEntries,
  type ForgeIssueSortMode,
} from "@/features/search/model/ranking";
import { forgeTitleIncludesRefId } from "@/features/forge/model/forge-label";
import { TabActions } from "@/features/search/ui/components/TabActions";
import { formatForgeEntryDate } from "@/features/search/ui/lib/format";
import { entryTextClass, projectBorderColors } from "@/features/search/ui/lib/styles";
import type { ForgeIssueEntry } from "@/features/forge/model/forge-label";
import { formatForgeKind, formatForgePlatform } from "@/features/forge/model/forge-label";
import { TimerCountdown } from "@/features/timers/ui/TimerCountdown";
import { TimerForm } from "@/features/timers/ui/TimerForm";
import { tabBrowserId, type TabInfo, type TabTimer, type TabTodo } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export function ForgeIssueNavigator({
  entries,
  backgroundColor,
  truncate,
  sortMode,
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
}: {
  entries: ForgeIssueEntry[];
  backgroundColor: string;
  truncate: boolean;
  sortMode: ForgeIssueSortMode;
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
}) {
  const providers = useMemo(() => groupForgeIssueEntries(entries, sortMode), [entries, sortMode]);
  // Index once instead of an indexOf scan per rendered row.
  const entryIndices = useMemo(
    () =>
      new Map(
        flattenForgeNavigatorEntries(entries, sortMode).map((entry, index) => [entry, index]),
      ),
    [entries, sortMode],
  );

  const renderEntries = (groupEntries: ForgeIssueEntry[]) => (
    <div class="flex min-w-0 flex-col gap-[var(--zen-issue-gap)]">
      {groupEntries.map((entry) => {
        const entryIndex = entryIndices.get(entry) ?? -1;
        const selected = selectedIndex === entryIndex;
        const tabId = tabBrowserId(entry.tab);
        const timer = timers.get(tabId ?? -1);
        const timerOpen = tabId !== undefined && timerTabId === tabId;
        const entryDate = formatForgeEntryDate(entry);
        const tabTitle = `${entry.tab.customLabel || ""} ${entry.tab.title || ""}`;
        const showRef = !forgeTitleIncludesRefId(tabTitle, entry.ref.id);
        return (
          <div
            key={`${entry.ref.url}:${entry.tab.id ?? entry.tab.domId ?? entry.title}`}
            class={cn(
              "hover:bg-zen-line-soft flex w-full max-w-full min-w-0 flex-col overflow-hidden rounded-[var(--zen-radius)]",
              selected && "bg-zen-line-soft",
            )}
            data-testid="zen-issue-entry"
            data-issue-selected={selected ? "true" : undefined}
            ref={(element) => {
              if (selected) {
                element?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }
            }}
            onContextMenu={(event) => onContextMenu(entry.tab, event)}
          >
            <div class="flex min-w-0 items-end">
              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer flex-col items-stretch overflow-hidden border-0 bg-transparent p-[var(--zen-space-2)] text-left font-[inherit] text-inherit"
                onClick={() => onActivate(entry)}
                onFocus={() => onSelect(entryIndex)}
                title={entry.ref.url}
              >
                <span
                  class={cn(
                    "block min-w-0 text-[length:var(--zen-text-base)]",
                    entryTextClass(truncate),
                  )}
                >
                  {forgeEntryDisplayTitle(entry)}
                </span>
                {(showRef || entryDate) && (
                  <span
                    class={cn(
                      "text-zen-subtle block min-w-0 text-[length:var(--zen-text-sm)]",
                      entryTextClass(truncate),
                    )}
                    title={entryDate ? `${entryDate.label}: ${entryDate.absolute}` : undefined}
                  >
                    {showRef ? `${formatForgeKind(entry.ref.kind)} #${entry.ref.id}` : ""}
                    {showRef && entryDate ? " · " : ""}
                    {entryDate ? `${entryDate.label}: ${entryDate.relative}` : ""}
                  </span>
                )}
              </button>
              <span class="text-zen-subtle flex shrink-0 items-center gap-[var(--zen-space-2)] p-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]">
                {timer && (
                  <span class="text-zen-lavender text-[length:var(--zen-text-xs)]">
                    <TimerCountdown endAt={timer.endAt} />
                  </span>
                )}
                <TabActions
                  tab={entry.tab}
                  timer={timer}
                  timerOpen={timerOpen}
                  isTodo={todos.has(tabId ?? -1)}
                  onToggleTodo={onToggleTodo}
                  onToggleTimer={onToggleTimerForm}
                  onOpenTimerPopup={onOpenTimerPopup}
                />
              </span>
            </div>
            {timerOpen && tabId !== undefined && (
              <div class="px-[var(--zen-space-2)] pb-[var(--zen-space-2)]">
                <TimerForm
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
  let projectBorderIndex = 0;

  return (
    <aside
      class="border-zen-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--zen-radius-lg)] border p-[var(--zen-space-2)]"
      style={{ backgroundColor }}
    >
      <div class="mb-[var(--zen-space-2)] flex min-w-0 items-center justify-between gap-[var(--zen-space-2)]">
        <strong class="min-w-0 truncate text-[length:var(--zen-text-base)]">
          Issues and requests
        </strong>
        <button
          type="button"
          class="text-zen-lavender shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[length:var(--zen-text-sm)]"
          onClick={onToggleSort}
          title="Change issue sorting"
        >
          {sortMode === "recent" ? "Recent" : "Old"} · {entries.length}
        </button>
      </div>
      <div class="zen-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {providers.length === 0 ? (
          <p class="text-zen-muted m-0 py-[var(--zen-space-3)] text-center text-[length:var(--zen-text-sm)]">
            No matching issues or requests.
          </p>
        ) : (
          <div class="divide-zen-line-soft flex min-w-0 flex-col divide-y">
            {providers.map(({ platform, projects }) => {
              return (
                <section
                  key={platform}
                  class="min-w-0 py-[var(--zen-space-3)] first:pt-0 last:pb-0"
                >
                  <div class="text-zen-lavender mb-[var(--zen-space-2)] truncate text-[length:var(--zen-text-sm)] font-semibold uppercase">
                    {formatForgePlatform(platform)}
                  </div>
                  <div class="flex min-w-0 flex-col gap-[var(--zen-space-3)]">
                    {projects.map((project) => (
                      <div
                        key={project.projectLabel}
                        class={cn(
                          "min-w-0 overflow-hidden rounded-[var(--zen-radius)] border-l-4 p-[var(--zen-space-2)]",
                          projectBorderColors[projectBorderIndex++ % projectBorderColors.length],
                        )}
                      >
                        <div class="text-zen-subtle mb-[var(--zen-space-2)] min-w-0 truncate text-[length:var(--zen-text-base)] font-medium">
                          {project.projectLabel}
                        </div>
                        <div class="flex min-w-0 flex-col gap-[var(--zen-space-2)]">
                          {project.issues.length > 0 && (
                            <div class="min-w-0">
                              <div class="text-zen-muted mb-[var(--zen-space-1)] px-[var(--zen-space-2)] text-[length:var(--zen-text-sm)] font-semibold uppercase">
                                Issues
                              </div>
                              {renderEntries(project.issues)}
                            </div>
                          )}
                          {project.requests.length > 0 && (
                            <div
                              class={cn(
                                "min-w-0",
                                project.issues.length > 0 &&
                                  "border-zen-line-soft border-t pt-[var(--zen-space-2)]",
                              )}
                            >
                              <div class="text-zen-muted mb-[var(--zen-space-1)] px-[var(--zen-space-2)] text-[length:var(--zen-text-sm)] font-semibold uppercase">
                                PRs / MRs
                              </div>
                              {renderEntries(project.requests)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
