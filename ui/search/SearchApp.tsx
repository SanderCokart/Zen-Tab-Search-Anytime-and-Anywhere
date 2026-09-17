import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { debugError } from "../../lib/debug";
import {
  sendExtensionMessage,
  subscribeToDisplaySettingsChanged,
  subscribeToSnapshotChanged,
} from "../../lib/messaging/client";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  type DisplaySettings,
} from "../../lib/display-settings";
import {
  buildForgeIssueEntries,
  buildSearchItems,
  filterForgeIssueEntries,
  filterSearchItems,
  flattenForgeNavigatorEntries,
  groupSearchItems,
  groupForgeIssueEntries,
  parseForgeNavigatorQuery,
  prioritizeCurrentTab,
  type ForgeIssueSortMode,
} from "../../lib/search";
import { forgeTitleIncludesRefId } from "../../lib/forge-label";
import { formatTimerCountdown, stripTimerPrefix } from "../../lib/timer";
import type { ForgeIssueEntry, SearchItem, SpaceInfo, TabInfo, TabTimer } from "../../lib/types";
import {
  formatSpaceDisplayTitle,
  formatForgeKind,
  formatForgePlatform,
  formatTabDisplayTitle,
  isEssentialTab,
  isActivatableTab,
  tabBrowserId,
} from "../../lib/types";
import { cn } from "../cn";
import { TimerForm } from "../timers/TimerForm";

export type SearchLayout = "popup" | "overlay";
const ESSENTIAL_TAB_NAMES_KEY = "essentialTabNames";

export interface SearchAppProps {
  onClose: () => void;
  pageJump?: number;
  layout?: SearchLayout;
}

function TimerIcon({ close = false, class: className }: { close?: boolean; class?: string }) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      {close ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5M9 3h6M12 3v2" />
        </>
      )}
    </svg>
  );
}

function hostname(url: string): string {
  try {
    return url ? new URL(url).hostname : "No URL";
  } catch {
    return "No URL";
  }
}

const primaryButtonClass =
  "cursor-pointer rounded-md border border-zen-border bg-zen-accent font-[inherit] text-zen-text hover:bg-zen-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
const clearButtonClass =
  "cursor-pointer rounded-md border border-zen-clear bg-transparent font-[inherit] text-zen-faint hover:bg-zen-surface-faint";
const projectBorderColors = [
  "border-red-400",
  "border-orange-400",
  "border-yellow-400",
  "border-green-400",
  "border-blue-400",
  "border-purple-400",
  "border-pink-400",
];
const folderBackgroundColors = [
  "bg-zen-surface-soft",
  "bg-zen-surface-softer",
  "bg-zen-surface-faint",
];

interface ForgeEntryDate {
  label: string;
  relative: string;
  absolute: string;
}

function formatForgeEntryDate(entry: ForgeIssueEntry): ForgeEntryDate | undefined {
  const timestamp = entry.tab.lastOpenedAt;
  if (timestamp === undefined) {
    return undefined;
  }
  const differenceSeconds = (timestamp - Date.now()) / 1000;
  const relativeUnit =
    Math.abs(differenceSeconds) >= 31_536_000
      ? { value: differenceSeconds / 31_536_000, unit: "year" as const }
      : Math.abs(differenceSeconds) >= 2_592_000
        ? { value: differenceSeconds / 2_592_000, unit: "month" as const }
        : Math.abs(differenceSeconds) >= 604_800
          ? { value: differenceSeconds / 604_800, unit: "week" as const }
          : Math.abs(differenceSeconds) >= 86_400
            ? { value: differenceSeconds / 86_400, unit: "day" as const }
            : Math.abs(differenceSeconds) >= 3_600
              ? { value: differenceSeconds / 3_600, unit: "hour" as const }
              : { value: differenceSeconds / 60, unit: "minute" as const };
  return {
    label: "Last opened",
    relative: new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(
      Math.round(relativeUnit.value),
      relativeUnit.unit,
    ),
    absolute: new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp),
  };
}

function TabSearchRow({
  tab,
  timer,
  timerOpen,
  compact,
  displayTitle,
  onToggleTimer,
  onOpenTimerPopup,
  onSetTimer,
  onClearTimer,
}: {
  tab: TabInfo;
  timer?: TabTimer;
  timerOpen: boolean;
  compact: boolean;
  displayTitle?: string;
  onToggleTimer: () => void;
  onOpenTimerPopup: () => void;
  onSetTimer: (endAt: number) => void;
  onClearTimer: () => void;
}) {
  const tabId = tabBrowserId(tab);
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);

  return (
    <>
      {tab.favIconUrl && (
        <img
          src={tab.favIconUrl}
          class={cn("shrink-0 rounded-sm", compact ? "mt-px size-4" : "size-[24px] rounded")}
        />
      )}
      <div class="flex min-w-0 flex-1 flex-col gap-px">
        <div class={cn("flex min-w-0 flex-col", compact ? "gap-1.5" : "gap-2")}>
          <div class="flex min-w-0 items-center gap-2">
            <span class={cn("text-zen-text min-w-0 flex-1 truncate", !compact && "text-[16px]")}>
              {displayTitle ??
                formatTabDisplayTitle({
                  ...tab,
                  customLabel: stripTimerPrefix(tab.customLabel || ""),
                })}
            </span>
            <span
              class={cn(
                "text-zen-lavender ml-auto flex shrink-0 items-center justify-end gap-1",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              {timer && !isEssentialTab(tab) && <span>⏱ {formatTimerCountdown(timer.endAt)}</span>}
            </span>
          </div>
          {timerOpen && tabId !== undefined && (
            <TimerForm timer={timer} compact={compact} onSet={onSetTimer} onClear={onClearTimer} />
          )}
        </div>
        <div
          class={cn(
            "text-zen-subtle flex min-w-0 items-center justify-between gap-1",
            compact ? "text-[11px]" : "text-[14px]",
            timerOpen && "pt-5",
          )}
        >
          <span class="truncate">
            {tab.active
              ? `${tab.workspaceName || hostname(tab.url)} · Current tab`
              : tab.workspaceName || hostname(tab.url)}
          </span>
          {tabId !== undefined && (
            <span
              class="group relative inline-flex shrink-0"
              onMouseEnter={() => setTooltipSuppressed(false)}
            >
              <button
                type="button"
                aria-label={isEssentialTab(tab) ? "Open timer popup" : "Open timer controls"}
                class="hover:text-zen-text inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-inherit"
                onClick={(event) => {
                  event.stopPropagation();
                  setTooltipSuppressed(true);
                  if (isEssentialTab(tab)) {
                    onOpenTimerPopup();
                  } else {
                    onToggleTimer();
                  }
                }}
              >
                <TimerIcon
                  close={timerOpen}
                  class={cn(timer && "text-zen-border", compact ? "size-[11px]" : "size-[14px]")}
                />
              </button>
              <span
                class={cn(
                  "bg-zen-tooltip text-zen-text pointer-events-none absolute right-0 bottom-full z-10 mb-1 w-max max-w-[220px] rounded px-2 py-1 text-xs opacity-0 shadow transition-opacity",
                  !tooltipSuppressed && "opacity-0 group-hover:opacity-100",
                )}
                role="tooltip"
              >
                {timer
                  ? `Timer: ${formatTimerCountdown(timer.endAt)}`
                  : isEssentialTab(tab)
                    ? "Open timer popup"
                    : timerOpen
                      ? "Close timer controls"
                      : "Open timer controls"}
              </span>
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function SearchShell({
  layout,
  onClose,
  children,
}: {
  layout: SearchLayout;
  onClose: () => void;
  children: ComponentChildren;
}) {
  if (layout === "popup") {
    return <div class="flex h-full flex-col">{children}</div>;
  }

  return (
    <div
      class="bg-zen-overlay flex h-full w-full items-center justify-center backdrop-blur-[8px]"
      onClick={onClose}
    >
      <div
        class="from-zen-bg to-zen-raised flex aspect-[3/2] h-auto w-[min(80vw,calc(90dvh*3/2))] shrink-0 flex-col overflow-hidden rounded-2xl bg-linear-to-br p-[16px] text-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        data-omnibar
      >
        {children}
      </div>
    </div>
  );
}

function ForgeIssueNavigator({
  entries,
  sortMode,
  selectedIndex,
  onActivate,
  onSelect,
  onToggleSort,
}: {
  entries: ForgeIssueEntry[];
  sortMode: ForgeIssueSortMode;
  selectedIndex: number;
  onActivate: (entry: ForgeIssueEntry) => void;
  onSelect: (index: number) => void;
  onToggleSort: () => void;
}) {
  const providers = groupForgeIssueEntries(entries, sortMode);
  const visualEntries = flattenForgeNavigatorEntries(entries, sortMode);

  const renderEntries = (groupEntries: ForgeIssueEntry[]) =>
    groupEntries.map((entry) => {
      const entryIndex = visualEntries.indexOf(entry);
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
          <span class="text-zen-text block min-w-0 truncate text-[16px]">{entry.title}</span>
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
    <aside class="border-zen-border bg-zen-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border p-[12px]">
      <div class="mb-3 flex min-w-0 items-center justify-between gap-2">
        <strong class="text-zen-text min-w-0 truncate text-[16px]">Issues and requests</strong>
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

export function SearchApp({ onClose, pageJump = 5, layout = "popup" }: SearchAppProps) {
  const compact = layout === "popup";
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [timers, setTimers] = useState<Map<number, TabTimer>>(new Map());
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedForgeIndex, setSelectedForgeIndex] = useState(0);
  const [focusPane, setFocusPane] = useState<"tabs" | "forge">("tabs");
  const [forgeSortMode, setForgeSortMode] = useState<ForgeIssueSortMode>("recent");
  const prefixedForgeQuery = useRef(false);
  const [timerTabId, setTimerTabId] = useState<number | null>(null);
  const [showTimers, setShowTimers] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<{
    tab: TabInfo;
    value: string;
  } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [essentialNames, setEssentialNames] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<{
    item: SearchItem;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-testid='zen-tab-context-menu']")
      ) {
        return;
      }
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [contextMenu]);

  useEffect(() => {
    void browser.storage.local.get(ESSENTIAL_TAB_NAMES_KEY).then((stored) => {
      const names = stored[ESSENTIAL_TAB_NAMES_KEY];
      if (names && typeof names === "object") {
        setEssentialNames(
          Object.fromEntries(
            Object.entries(names).filter(
              ([key, value]) => typeof key === "string" && typeof value === "string",
            ),
          ),
        );
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applySnapshot = (snapshot: {
      tabs: TabInfo[];
      spaces: SpaceInfo[];
      timers: TabTimer[];
    }) => {
      setTabs(snapshot.tabs.filter(isActivatableTab));
      setSpaces(snapshot.spaces);
      setTimers(new Map(snapshot.timers.map((item) => [item.tabId, item])));
      setLoadError(null);
    };
    const load = () =>
      sendExtensionMessage({ type: "getSnapshot" })
        .then((snapshot) => {
          if (!cancelled) {
            applySnapshot(snapshot);
          }
        })
        .catch((error) => {
          debugError("Could not load search data:", error);
          if (!cancelled) {
            setLoadError("Unable to load tabs. Make sure the extension is enabled in Zen Browser.");
          }
        });

    const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
    void load();
    const unsubscribe = subscribeToSnapshotChanged(() => {
      void load();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    void readDisplaySettings()
      .then(setDisplaySettings)
      .catch((error) => debugError("Could not load display settings:", error));
    return subscribeToDisplaySettingsChanged(setDisplaySettings);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTimers((current) => new Map(current)), 1000);
    return () => window.clearInterval(id);
  }, []);

  const forgeIssueEntries = useMemo(() => buildForgeIssueEntries(tabs), [tabs]);
  const labeledTabs = useMemo(
    () =>
      tabs.map((tab) => {
        if (!isEssentialTab(tab) || !tab.domId) {
          return tab;
        }
        return { ...tab, customLabel: essentialNames[tab.domId] || "" };
      }),
    [essentialNames, tabs],
  );
  const visibleTabs = useMemo(
    () =>
      layout === "overlay" && displaySettings.filterIssuesInOverlay
        ? labeledTabs.filter((tab) => !buildForgeIssueEntries([tab]).length)
        : labeledTabs,
    [displaySettings.filterIssuesInOverlay, labeledTabs, layout],
  );
  const forgeNavigatorQuery = useMemo(() => parseForgeNavigatorQuery(query), [query]);
  const filteredForgeIssueEntries = useMemo(
    () => filterForgeIssueEntries(forgeIssueEntries, forgeNavigatorQuery.filterQuery),
    [forgeIssueEntries, forgeNavigatorQuery.filterQuery],
  );
  const navigatorEntries = useMemo(
    () => flattenForgeNavigatorEntries(filteredForgeIssueEntries, forgeSortMode),
    [filteredForgeIssueEntries, forgeSortMode],
  );
  const items = useMemo(() => {
    const matches = filterSearchItems(
      buildSearchItems(visibleTabs, spaces),
      forgeNavigatorQuery.active ? forgeNavigatorQuery.filterQuery : query,
    );
    const activeId = visibleTabs.find(
      (tab) => tab.active === true && tabBrowserId(tab) !== undefined,
    )?.id;
    return (forgeNavigatorQuery.active ? forgeNavigatorQuery.filterQuery : query).trim()
      ? matches
      : prioritizeCurrentTab(matches, activeId);
  }, [forgeNavigatorQuery, query, spaces, visibleTabs]);
  const itemGroups = useMemo(
    () =>
      groupSearchItems(items, {
        groupFolders: displaySettings.groupFolders,
        groupSubfolders: displaySettings.groupSubfolders,
      }),
    [displaySettings.groupFolders, displaySettings.groupSubfolders, items],
  );
  const canFocusForge = layout === "overlay" && navigatorEntries.length > 0;
  const canFocusTabs = items.length > 0;
  const navigateForge = focusPane === "forge" ? canFocusForge : !canFocusTabs && canFocusForge;

  useEffect(() => {
    optionRefs.current = [];
    setSelectedIndex((current) => {
      if (navigateForge || !items.length) {
        return -1;
      }
      return current >= 0 && current < items.length ? current : 0;
    });
  }, [items, navigateForge]);

  useEffect(() => {
    if (renameDialog) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renameDialog?.tab.domId]);

  useEffect(() => {
    setSelectedForgeIndex((current) =>
      navigatorEntries.length ? Math.min(current, navigatorEntries.length - 1) : 0,
    );
  }, [navigatorEntries]);

  useEffect(() => {
    const prefixed = forgeNavigatorQuery.active;
    if (prefixed && canFocusForge && !prefixedForgeQuery.current) {
      setFocusPane("forge");
      setSelectedForgeIndex(0);
    } else if (!prefixed && prefixedForgeQuery.current) {
      setFocusPane(canFocusTabs ? "tabs" : "forge");
    }
    prefixedForgeQuery.current = prefixed;
  }, [canFocusForge, canFocusTabs, forgeNavigatorQuery.active]);

  useEffect(() => {
    if (navigateForge && !canFocusForge && canFocusTabs) {
      setFocusPane("tabs");
    } else if (!canFocusTabs && canFocusForge) {
      setFocusPane("forge");
    }
  }, [canFocusForge, canFocusTabs, navigateForge]);

  useEffect(() => {
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const activateItem = (item: SearchItem) => {
    if (item.kind === "space") {
      void sendExtensionMessage({ type: "switchSpace", spaceId: item.data.id })
        .then(onClose)
        .catch((error) => debugError("Could not switch space:", error));
      return;
    }
    if (!isActivatableTab(item.data)) return;
    void sendExtensionMessage({
      type: "switchTab",
      tabId: tabBrowserId(item.data),
      domId: item.data.domId || undefined,
    })
      .then(onClose)
      .catch((error) => debugError("Could not switch tab:", error));
  };
  const activateForgeEntry = (entry: ForgeIssueEntry) => {
    if (!isActivatableTab(entry.tab)) return;
    void sendExtensionMessage({
      type: "switchTab",
      tabId: tabBrowserId(entry.tab),
      domId: entry.tab.domId || undefined,
    })
      .then(onClose)
      .catch((error) => debugError("Could not switch issue tab:", error));
  };
  const toggleForgeSort = () => {
    setForgeSortMode((current) => (current === "recent" ? "old" : "recent"));
    setSelectedForgeIndex(0);
  };

  const setTimer = (tabId: number, endAt: number) => {
    void sendExtensionMessage({ type: "setTimer", tabId, endAt })
      .then((timer) => {
        setTimers((current) => new Map(current).set(tabId, timer));
        setTimerTabId(null);
      })
      .catch((error) => debugError("Could not set timer:", error));
  };

  const clearTimer = (tabId: number) => {
    void sendExtensionMessage({ type: "clearTimer", tabId })
      .then(() => {
        setTimers((current) => {
          const next = new Map(current);
          next.delete(tabId);
          return next;
        });
        setTimerTabId(null);
      })
      .catch((error) => debugError("Could not clear timer:", error));
  };

  const renderSearchItem = (item: SearchItem) => {
    const index = items.indexOf(item);
    return (
      <li
        key={`${item.kind}-${index}`}
        ref={(element) => {
          optionRefs.current[index] = element;
        }}
        data-testid="zen-search-item"
        data-selected={selectedIndex === index ? "true" : undefined}
        class={cn(
          "flex min-w-0 cursor-pointer items-start transition-colors",
          item.kind === "space" && "items-center justify-center text-center",
          compact ? "gap-2 rounded-md px-2 py-1.5 text-[13px]" : "gap-[12px] rounded-lg p-[12px]",
          selectedIndex === index ? "bg-zen-line-soft" : "hover:bg-zen-line-soft",
          item.kind === "space" && item.data.isActive && "bg-zen-accent",
        )}
        role="option"
        aria-selected={selectedIndex === index}
        onContextMenu={(event) => {
          if (item.kind !== "tab") {
            return;
          }
          event.preventDefault();
          setContextMenu({
            item,
            x: Math.min(event.clientX, window.innerWidth - 180),
            y: Math.min(event.clientY, window.innerHeight - 52),
          });
        }}
        onClick={() => activateItem(item)}
      >
        {item.kind === "space" ? (
          <>
            <span
              class={cn(
                "mt-px flex shrink-0 items-center justify-center leading-none",
                compact ? "size-4 text-xs" : "size-[24px] text-[16px]",
              )}
            >
              {item.data.icon?.trim() || "◆"}
            </span>
            <div
              class={cn(
                "flex min-w-0 flex-col gap-px",
                item.kind === "space" ? "w-auto items-center" : "flex-1",
                "text-zen-text",
              )}
            >
              <span
                class={cn(
                  "min-w-0 truncate font-semibold",
                  item.kind === "space" ? "flex-none" : "flex-1",
                  !compact && "text-[16px]",
                )}
              >
                {formatSpaceDisplayTitle(item.data)}
              </span>
            </div>
          </>
        ) : (
          <TabSearchRow
            tab={item.data}
            timer={timers.get(tabBrowserId(item.data) ?? -1)}
            timerOpen={timerTabId !== null && timerTabId === tabBrowserId(item.data)}
            compact={compact}
            displayTitle={
              isEssentialTab(item.data)
                ? item.data.customLabel?.trim() || item.data.title
                : undefined
            }
            onToggleTimer={() => {
              const tabId = tabBrowserId(item.data);
              if (tabId !== undefined) {
                setTimerTabId(timerTabId === tabId ? null : tabId);
              }
            }}
            onOpenTimerPopup={() => {
              const tabId = tabBrowserId(item.data);
              if (tabId !== undefined) {
                void sendExtensionMessage({ type: "openTimerPopup", tabId }).catch((error) =>
                  debugError("Could not open timer popup:", error),
                );
              }
            }}
            onSetTimer={(endAt) => {
              const tabId = tabBrowserId(item.data);
              if (tabId !== undefined) {
                setTimer(tabId, endAt);
              }
            }}
            onClearTimer={() => {
              const tabId = tabBrowserId(item.data);
              if (tabId !== undefined) {
                clearTimer(tabId);
              }
            }}
          />
        )}
      </li>
    );
  };

  const renderSearchGroups = (groups: ReturnType<typeof groupSearchItems>, level = 0) =>
    groups.map((group, groupIndex) => {
      if (group.folderId === undefined) {
        const spaces = group.items.filter((item) => item.kind === "space");
        const essentialTabs = group.items.filter(
          (item) => item.kind === "tab" && isEssentialTab(item.data),
        );
        const tabs = group.items.filter(
          (item) => item.kind === "tab" && !isEssentialTab(item.data),
        );
        return (
          <section key={`ungrouped-${level}-${groupIndex}`} class="contents">
            {spaces.length > 0 && (
              <li
                class={cn(
                  "bg-zen-surface-faint rounded-md p-1",
                  essentialTabs.length > 0 && "mb-2",
                )}
                data-testid="zen-space-section"
              >
                <div class="text-zen-subtle border-zen-line-soft border-b px-2 py-1 text-xs font-semibold uppercase">
                  Spaces
                </div>
                <ul
                  class={cn(
                    "m-0 grid list-none gap-2 p-2",
                    compact
                      ? "grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]"
                      : "grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]",
                  )}
                  data-testid="zen-space-grid"
                >
                  {spaces.map(renderSearchItem)}
                </ul>
              </li>
            )}
            {essentialTabs.length > 0 && (
              <li class="bg-zen-surface-faint rounded-md p-1" data-testid="zen-essential-section">
                <div class="text-zen-subtle border-zen-line-soft border-b px-2 py-1 text-xs font-semibold uppercase">
                  Essential tabs
                </div>
                <ul
                  class={cn(
                    "m-0 grid list-none gap-2 p-2",
                    compact
                      ? "grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]"
                      : "grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]",
                  )}
                  data-testid="zen-essential-grid"
                >
                  {essentialTabs.map(renderSearchItem)}
                </ul>
              </li>
            )}
            {tabs.map(renderSearchItem)}
          </section>
        );
      }
      const backgroundClass =
        folderBackgroundColors[Math.min(level, folderBackgroundColors.length - 1)];
      return (
        <li
          key={`${group.folderId}-${level}-${groupIndex}`}
          class={cn(level > 0 ? "mx-1 my-2" : "mt-3 first:mt-0", "rounded-md p-1", backgroundClass)}
          data-testid="zen-folder-section"
        >
          <div
            class={cn(
              "border-b px-2 py-1 text-[12px] font-semibold uppercase",
              level === 0
                ? "border-gray-400/30 text-gray-300"
                : level === 1
                  ? "border-gray-500/20 text-gray-400"
                  : "border-gray-600/20 text-gray-500",
              level > 0 && "pl-4",
              level > 1 && "pl-6",
            )}
            data-testid="zen-folder-group"
            role="presentation"
          >
            {group.folderName}
          </div>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            {group.items.map(renderSearchItem)}
            {renderSearchGroups(group.children, level + 1)}
          </ul>
        </li>
      );
    });

  return (
    <SearchShell layout={layout} onClose={onClose}>
      <div class={cn("flex items-center", compact ? "mb-2 gap-2" : "mb-[16px] gap-2")}>
        <input
          ref={inputRef}
          data-testid="zen-search-input"
          type="text"
          placeholder="Search tabs and spaces..."
          class={cn(
            "bg-zen-surface placeholder:text-zen-muted text-zen-text min-w-0 flex-1 rounded-lg border-0 outline-none",
            compact ? "w-full px-2.5 py-2 text-sm" : "p-[12px] text-[18px]",
          )}
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            const count = items.length;
            const forgeCount = navigatorEntries.length;
            if (event.key === "Escape") {
              onClose();
              event.preventDefault();
            } else if (event.key === "Tab" && canFocusForge && canFocusTabs) {
              event.preventDefault();
              if (navigateForge) {
                setFocusPane("tabs");
                setSelectedIndex((current) => (current >= 0 && current < count ? current : 0));
              } else {
                setFocusPane("forge");
                setSelectedForgeIndex((current) =>
                  current >= 0 && current < forgeCount ? current : 0,
                );
              }
            } else if (
              (event.key === "#" || event.key === "!") &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              canFocusForge &&
              (inputRef.current?.selectionStart ?? 0) === 0
            ) {
              setFocusPane("forge");
              setSelectedForgeIndex(0);
            } else if (event.key === "Enter") {
              if (navigateForge) {
                const selectedForge = navigatorEntries[selectedForgeIndex];
                if (selectedForge) {
                  activateForgeEntry(selectedForge);
                }
              } else {
                const selected = items[selectedIndex];
                if (selected) {
                  activateItem(selected);
                }
              }
              event.preventDefault();
            } else if (event.key === "ArrowDown") {
              if (navigateForge) {
                setSelectedForgeIndex((selectedForgeIndex + 1) % forgeCount);
              } else if (count) {
                setSelectedIndex((selectedIndex + 1) % count);
              }
              event.preventDefault();
            } else if (event.key === "ArrowUp") {
              if (navigateForge) {
                setSelectedForgeIndex(
                  selectedForgeIndex <= 0 ? forgeCount - 1 : selectedForgeIndex - 1,
                );
              } else if (count) {
                setSelectedIndex(selectedIndex <= 0 ? count - 1 : selectedIndex - 1);
              }
              event.preventDefault();
            } else if (event.key === "ArrowRight") {
              if (navigateForge) {
                setSelectedForgeIndex(Math.min(selectedForgeIndex + pageJump, forgeCount - 1));
              } else if (count) {
                setSelectedIndex(Math.min(selectedIndex + pageJump, count - 1));
              }
              event.preventDefault();
            } else if (event.key === "ArrowLeft") {
              if (navigateForge) {
                setSelectedForgeIndex(Math.max(selectedForgeIndex - pageJump, 0));
              } else if (count) {
                setSelectedIndex(Math.max(selectedIndex - pageJump, 0));
              }
              event.preventDefault();
            }
          }}
        />
        <button
          type="button"
          class={cn(
            primaryButtonClass,
            "relative inline-flex shrink-0 items-center justify-center p-0",
            compact ? "size-8" : "size-[44px]",
          )}
          title={showTimers ? "Close active timers" : "Show active timers"}
          onClick={() => setShowTimers(!showTimers)}
        >
          <TimerIcon close={showTimers} class={compact ? "size-3.5" : "size-[16px]"} />
          {!showTimers && timers.size > 0 && (
            <span
              class={cn(
                "bg-zen-badge text-zen-text absolute -top-1 -right-1 rounded-full text-center",
                compact
                  ? "min-w-3.5 px-0.5 text-[9px] leading-[14px]"
                  : "min-w-4 px-1 text-[10px] leading-4",
              )}
            >
              {timers.size}
            </span>
          )}
        </button>
        <button
          type="button"
          class={cn(
            primaryButtonClass,
            "inline-flex shrink-0 items-center justify-center p-0",
            compact ? "size-8" : "size-[44px]",
          )}
          title="Open display settings"
          aria-label="Open display settings"
          onClick={() =>
            void sendExtensionMessage({ type: "openSettings" }).catch((error) =>
              debugError("Could not open settings:", error),
            )
          }
        >
          <span aria-hidden="true" class={compact ? "text-sm" : "text-lg"}>
            ⚙
          </span>
        </button>
      </div>
      {showTimers && (
        <div
          class={cn(
            "border-zen-accent bg-zen-panel rounded-lg border",
            compact ? "mb-2 p-2" : "mb-[12px] rounded-[10px] p-[12px]",
          )}
        >
          <div
            class={cn(
              "text-zen-text mb-2 flex items-center justify-between gap-2",
              compact ? "text-xs" : "text-[14px]",
            )}
          >
            <strong>Active timers</strong>
            {timers.size > 0 && (
              <button
                type="button"
                class={cn(clearButtonClass, compact ? "px-1.5 py-0.5" : "px-2.5 py-1.5")}
                onClick={() =>
                  void sendExtensionMessage({ type: "clearAllTimers" })
                    .then(() => setTimers(new Map()))
                    .catch((error) => debugError("Could not clear timers:", error))
                }
              >
                Clear all
              </button>
            )}
          </div>
          {timers.size === 0 ? (
            <p class={cn("text-zen-muted m-0", compact ? "text-xs" : "text-[13px]")}>
              No active timers.
            </p>
          ) : (
            <ul
              class={cn(
                "zen-scroll m-0 flex list-none flex-col overflow-y-auto p-0",
                compact ? "max-h-[180px] gap-1.5" : "max-h-[220px] gap-[8px]",
              )}
            >
              {[...timers.values()]
                .sort((a, b) => a.endAt - b.endAt)
                .map((timer) => (
                  <li class="flex items-center gap-2">
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
                      onClick={() =>
                        void sendExtensionMessage({ type: "switchTab", tabId: timer.tabId }).then(
                          onClose,
                        )
                      }
                    >
                      <span class="text-zen-text max-w-full truncate">
                        {timer.title || timer.originalLabel || `Tab ${timer.tabId}`}
                      </span>
                      <span
                        class={cn("text-zen-lavender", compact ? "text-[11px]" : "text-[12px]")}
                      >
                        ⏱ {formatTimerCountdown(timer.endAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      class={cn(clearButtonClass, compact ? "px-1.5 py-0.5" : "px-2.5 py-1.5")}
                      onClick={() => clearTimer(timer.tabId)}
                    >
                      Clear
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <div class={cn(layout === "overlay" && "flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden")}>
        <div class={cn(layout === "overlay" && "flex min-h-0 min-w-0 flex-1 flex-col")}>
          <ul
            class={cn(
              "zen-scroll m-0 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto p-0",
              compact && "min-h-[60px]",
            )}
            role="listbox"
          >
            {renderSearchGroups(itemGroups)}
          </ul>
          {(loadError || (items.length === 0 && visibleTabs.length + spaces.length > 0)) && (
            <div class="text-zen-muted px-1 py-3 text-center text-xs">
              {loadError || "No tabs or spaces found."}
            </div>
          )}
          {!loadError && tabs.length + spaces.length === 0 && (
            <div class="text-zen-muted px-1 py-3 text-center text-xs">Loading tabs and spaces…</div>
          )}
        </div>
        {layout === "overlay" && forgeIssueEntries.length > 0 && (
          <ForgeIssueNavigator
            entries={filteredForgeIssueEntries}
            sortMode={forgeSortMode}
            selectedIndex={navigateForge ? selectedForgeIndex : -1}
            onActivate={activateForgeEntry}
            onSelect={setSelectedForgeIndex}
            onToggleSort={toggleForgeSort}
          />
        )}
      </div>
      {contextMenu?.item.kind === "tab" && (
        <div
          class="bg-zen-panel border-zen-line-medium fixed z-50 min-w-[180px] rounded-md border p-1 shadow-lg"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          data-testid="zen-tab-context-menu"
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {isEssentialTab(contextMenu.item.data) && (
            <button
              type="button"
              class="text-zen-text hover:bg-zen-line-soft flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left font-[inherit] text-sm"
              role="menuitem"
              onClick={() => {
                setContextMenu(null);
                setRenameError(null);
                setRenameDialog({
                  tab: contextMenu.item.data,
                  value: contextMenu.item.data.customLabel || "",
                });
              }}
            >
              <span aria-hidden="true">✎</span>
              Rename
            </button>
          )}
          {tabBrowserId(contextMenu.item.data) !== undefined && (
            <button
              type="button"
              class="text-zen-text hover:bg-zen-line-soft flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left font-[inherit] text-sm"
              role="menuitem"
              onClick={() => {
                const tabId = tabBrowserId(contextMenu.item.data);
                setContextMenu(null);
                if (tabId !== undefined) {
                  void sendExtensionMessage({ type: "openTimerPopup", tabId }).catch((error) =>
                    debugError("Could not open timer popup:", error),
                  );
                }
              }}
            >
              <TimerIcon class="size-4" />
              Timer
            </button>
          )}
        </div>
      )}
      {renameDialog && (
        <div class="bg-zen-overlay-soft fixed inset-0 z-50 flex items-center justify-center p-4">
          <form
            class="border-zen-accent bg-zen-panel w-full max-w-sm rounded-lg border p-4 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              const domId = renameDialog.tab.domId;
              if (!domId) {
                setRenameError("This tab cannot be renamed.");
                return;
              }
              const name = renameDialog.value.replace(/\s+/g, " ").trim();
              const nextNames = { ...essentialNames };
              if (name) {
                nextNames[domId] = name;
              } else {
                delete nextNames[domId];
              }
              void browser.storage.local
                .set({ [ESSENTIAL_TAB_NAMES_KEY]: nextNames })
                .then(() => {
                  setEssentialNames(nextNames);
                  setRenameDialog(null);
                })
                .catch((error) => {
                  debugError("Could not save essential tab name:", error);
                  setRenameError("Could not rename this tab.");
                });
            }}
          >
            <label class="text-zen-text flex flex-col gap-2 text-sm">
              Rename essential tab
              <input
                ref={renameInputRef}
                class="focus:border-zen-accent border-zen-line-strong bg-zen-overlay-soft text-zen-text rounded border px-2 py-1.5 outline-none"
                value={renameDialog.value}
                onInput={(event) =>
                  setRenameDialog((current) =>
                    current ? { ...current, value: event.currentTarget.value } : current,
                  )
                }
              />
            </label>
            {renameError && <p class="text-zen-danger mt-2 mb-0 text-xs">{renameError}</p>}
            <div class="mt-4 flex justify-end gap-2">
              <button
                type="button"
                class={cn(clearButtonClass, "px-3 py-1.5 text-sm")}
                onClick={() => setRenameDialog(null)}
              >
                Cancel
              </button>
              <button type="submit" class={cn(primaryButtonClass, "px-3 py-1.5 text-sm")}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </SearchShell>
  );
}
