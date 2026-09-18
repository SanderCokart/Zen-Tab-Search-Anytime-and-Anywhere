import { useMemo } from "preact/hooks";
import {
  flattenForgeNavigatorEntries,
  forgeEntryDisplayTitle,
  groupForgeIssueEntries,
  type ForgeIssueSortMode,
} from "@/features/search/model/ranking";
import { forgeTitleIncludesRefId } from "@/features/forge/model/forge-label";
import { formatForgeEntryDate } from "@/features/search/ui/lib/format";
import { projectBorderColors } from "@/features/search/ui/lib/styles";
import type { ForgeIssueEntry } from "@/shared/types";
import { formatForgeKind, formatForgePlatform } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export function ForgeIssueNavigator({
  entries,
  backgroundColor,
  sortMode,
  selectedIndex,
  onActivate,
  onSelect,
  onToggleSort,
}: {
  entries: ForgeIssueEntry[];
  backgroundColor: string;
  sortMode: ForgeIssueSortMode;
  selectedIndex: number;
  onActivate: (entry: ForgeIssueEntry) => void;
  onSelect: (index: number) => void;
  onToggleSort: () => void;
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

  const renderEntries = (groupEntries: ForgeIssueEntry[]) =>
    groupEntries.map((entry) => {
      const entryIndex = entryIndices.get(entry) ?? -1;
      return (
        <button
          key={`${entry.ref.url}:${entry.tab.id ?? entry.tab.domId ?? entry.title}`}
          type="button"
          class={cn(
            "hover:bg-zen-line-soft flex w-full max-w-full min-w-0 cursor-pointer flex-col items-stretch overflow-hidden rounded-lg border-0 bg-transparent p-[12px] text-left font-[inherit] text-inherit",
            selectedIndex === entryIndex && "bg-zen-line-soft",
          )}
          data-issue-selected={selectedIndex === entryIndex ? "true" : undefined}
          ref={(element) => {
            if (selectedIndex === entryIndex) {
              element?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
          }}
          onClick={() => onActivate(entry)}
          onFocus={() => onSelect(entryIndex)}
          title={entry.ref.url}
        >
          <span class="block min-w-0 truncate text-[16px]">{forgeEntryDisplayTitle(entry)}</span>
          {(() => {
            const entryDate = formatForgeEntryDate(entry);
            const tabTitle = `${entry.tab.customLabel || ""} ${entry.tab.title || ""}`;
            const showRef = !forgeTitleIncludesRefId(tabTitle, entry.ref.id);
            if (!showRef && !entryDate) {
              return null;
            }
            return (
              <span
                class="text-zen-subtle block min-w-0 truncate text-[14px]"
                title={entryDate ? `${entryDate.label}: ${entryDate.absolute}` : undefined}
              >
                {showRef ? `${formatForgeKind(entry.ref.kind)} #${entry.ref.id}` : ""}
                {showRef && entryDate ? " · " : ""}
                {entryDate ? `${entryDate.label}: ${entryDate.relative}` : ""}
              </span>
            );
          })()}
        </button>
      );
    });
  let projectBorderIndex = 0;

  return (
    <aside
      class="border-zen-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border p-[12px]"
      style={{ backgroundColor }}
    >
      <div class="mb-3 flex min-w-0 items-center justify-between gap-2">
        <strong class="min-w-0 truncate text-[16px]">Issues and requests</strong>
        <button
          type="button"
          class="text-zen-lavender shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[14px]"
          onClick={onToggleSort}
          title="Change issue sorting"
        >
          {sortMode === "recent" ? "Recent" : "Old"} · {entries.length}
        </button>
      </div>
      <div class="zen-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {providers.length === 0 ? (
          <p class="text-zen-muted m-0 py-3 text-center text-[14px]">
            No matching issues or requests.
          </p>
        ) : (
          <div class="divide-zen-line-soft flex min-w-0 flex-col divide-y">
            {providers.map(({ platform, projects }) => {
              return (
                <section key={platform} class="min-w-0 py-3 first:pt-0 last:pb-0">
                  <div class="text-zen-lavender mb-2 truncate text-[14px] font-semibold uppercase">
                    {formatForgePlatform(platform)}
                  </div>
                  <div class="flex min-w-0 flex-col gap-3">
                    {projects.map((project) => (
                      <div
                        key={project.projectLabel}
                        class={cn(
                          "min-w-0 overflow-hidden rounded-lg border-l-4 p-[12px]",
                          projectBorderColors[projectBorderIndex++ % projectBorderColors.length],
                        )}
                      >
                        <div class="text-zen-subtle mb-2 min-w-0 truncate text-[16px] font-medium">
                          {project.projectLabel}
                        </div>
                        <div class="flex min-w-0 flex-col gap-2">
                          {project.issues.length > 0 && (
                            <div class="min-w-0">
                              <div class="text-zen-muted mb-1 px-[12px] text-[14px] font-semibold uppercase">
                                Issues
                              </div>
                              {renderEntries(project.issues)}
                            </div>
                          )}
                          {project.requests.length > 0 && (
                            <div
                              class={cn(
                                "min-w-0",
                                project.issues.length > 0 && "border-zen-line-soft border-t pt-2",
                              )}
                            >
                              <div class="text-zen-muted mb-1 px-[12px] text-[14px] font-semibold uppercase">
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
