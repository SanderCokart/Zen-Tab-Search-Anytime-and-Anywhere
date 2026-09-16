import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { debugError } from "../../lib/debug";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "../../lib/messaging/client";
import { buildSearchItems, filterSearchItems, prioritizeCurrentTab } from "../../lib/search";
import { formatTimerCountdown, stripTimerPrefix } from "../../lib/timer";
import type { SearchItem, SpaceInfo, TabInfo, TabTimer } from "../../lib/types";
import {
  formatSpaceDisplayTitle,
  formatTabDisplayTitle,
  isActivatableTab,
  tabBrowserId,
} from "../../lib/types";
import { cn } from "../cn";
import { TimerForm } from "../timers/TimerForm";

export type SearchLayout = "popup" | "overlay";

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
  "cursor-pointer rounded-md border border-zen-border bg-zen-accent font-[inherit] text-white hover:bg-zen-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
const clearButtonClass =
  "cursor-pointer rounded-md border border-zen-clear bg-transparent font-[inherit] text-zen-faint hover:bg-white/5";

function TabSearchRow({
  tab,
  timer,
  timerOpen,
  compact,
  onToggleTimer,
  onSetTimer,
  onClearTimer,
}: {
  tab: TabInfo;
  timer?: TabTimer;
  timerOpen: boolean;
  compact: boolean;
  onToggleTimer: () => void;
  onSetTimer: (endAt: number) => void;
  onClearTimer: () => void;
}) {
  const tabId = tabBrowserId(tab);

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
            <span class={cn("min-w-0 flex-1 truncate text-white", !compact && "text-[16px]")}>
              {formatTabDisplayTitle({
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
              {timer && <span>⏱ {formatTimerCountdown(timer.endAt)}</span>}
              {tabId !== undefined && (
                <button
                  type="button"
                  class={cn(
                    primaryButtonClass,
                    "inline-flex items-center justify-center p-0",
                    compact ? "size-6" : "size-[28px]",
                  )}
                  title="Set a timer for this tab"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleTimer();
                  }}
                >
                  <TimerIcon close={timerOpen} class={compact ? "size-3.5" : "size-[16px]"} />
                </button>
              )}
            </span>
          </div>
          {timerOpen && tabId !== undefined && (
            <TimerForm timer={timer} compact={compact} onSet={onSetTimer} onClear={onClearTimer} />
          )}
        </div>
        <span class={cn("text-zen-subtle truncate", compact ? "text-[11px]" : "text-[14px]")}>
          {tab.active
            ? `${tab.workspaceName || hostname(tab.url)} · Current tab`
            : tab.workspaceName || hostname(tab.url)}
        </span>
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
      class="flex h-full w-full items-center justify-center bg-black/60 backdrop-blur-[8px]"
      onClick={onClose}
    >
      <div
        class="from-zen-bg to-zen-raised flex max-h-[600px] min-h-[200px] w-[60vw] max-w-[600px] flex-col overflow-hidden rounded-2xl bg-linear-to-br p-[16px] text-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        data-omnibar
      >
        {children}
      </div>
    </div>
  );
}

export function SearchApp({ onClose, pageJump = 5, layout = "popup" }: SearchAppProps) {
  const compact = layout === "popup";
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [timers, setTimers] = useState<Map<number, TabTimer>>(new Map());
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [timerTabId, setTimerTabId] = useState<number | null>(null);
  const [showTimers, setShowTimers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    const id = window.setInterval(() => setTimers((current) => new Map(current)), 1000);
    return () => window.clearInterval(id);
  }, []);

  const items = useMemo(() => {
    const matches = filterSearchItems(buildSearchItems(tabs, spaces), query);
    const activeId = tabs.find((tab) => tab.active === true && tabBrowserId(tab) !== undefined)?.id;
    return query.trim() ? matches : prioritizeCurrentTab(matches, activeId);
  }, [query, spaces, tabs]);

  useEffect(() => {
    optionRefs.current = [];
    setSelectedIndex((current) => {
      if (!items.length) {
        return -1;
      }
      return current >= 0 && current < items.length ? current : 0;
    });
  }, [items]);

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

  return (
    <SearchShell layout={layout} onClose={onClose}>
      <div class={cn("flex items-center", compact ? "mb-2 gap-2" : "mb-[16px] gap-2")}>
        <input
          ref={inputRef}
          data-testid="zen-search-input"
          type="text"
          placeholder="Search tabs and spaces..."
          class={cn(
            "bg-zen-surface placeholder:text-zen-muted min-w-0 flex-1 rounded-lg border-0 text-white outline-none",
            compact ? "w-full px-2.5 py-2 text-sm" : "p-[12px] text-[18px]",
          )}
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            const count = items.length;
            if (event.key === "Escape") {
              onClose();
              event.preventDefault();
            } else if (event.key === "Enter") {
              const selected = items[selectedIndex];
              if (selected) {
                activateItem(selected);
              }
              event.preventDefault();
            } else if (event.key === "ArrowDown") {
              setSelectedIndex(count ? (selectedIndex + 1) % count : -1);
              event.preventDefault();
            } else if (event.key === "ArrowUp") {
              setSelectedIndex(count ? (selectedIndex <= 0 ? count - 1 : selectedIndex - 1) : -1);
              event.preventDefault();
            } else if (event.key === "ArrowRight") {
              setSelectedIndex(Math.min(selectedIndex + pageJump, count - 1));
              event.preventDefault();
            } else if (event.key === "ArrowLeft") {
              setSelectedIndex(Math.max(selectedIndex - pageJump, 0));
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
                "bg-zen-badge absolute -top-1 -right-1 rounded-full text-center text-white",
                compact
                  ? "min-w-3.5 px-0.5 text-[9px] leading-[14px]"
                  : "min-w-4 px-1 text-[10px] leading-4",
              )}
            >
              {timers.size}
            </span>
          )}
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
              "mb-2 flex items-center justify-between gap-2 text-white",
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
                      <span class="max-w-full truncate text-white">
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
      <ul
        class={cn(
          "zen-scroll m-0 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto p-0",
          compact && "min-h-[60px]",
        )}
        role="listbox"
      >
        {items.map((item, index) => (
          <li
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            data-testid="zen-search-item"
            data-selected={selectedIndex === index ? "true" : undefined}
            class={cn(
              "flex cursor-pointer items-start transition-colors",
              compact
                ? "gap-2 rounded-md px-2 py-1.5 text-[13px]"
                : "gap-[12px] rounded-lg p-[12px]",
              selectedIndex === index ? "bg-white/10" : "hover:bg-white/10",
            )}
            role="option"
            aria-selected={selectedIndex === index}
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
                <div class="flex min-w-0 flex-1 flex-col gap-px">
                  <span
                    class={cn(
                      "min-w-0 flex-1 truncate font-semibold text-white",
                      !compact && "text-[16px]",
                    )}
                  >
                    {formatSpaceDisplayTitle(item.data)}
                  </span>
                  <span
                    class={cn("text-zen-subtle truncate", compact ? "text-[11px]" : "text-[14px]")}
                  >
                    {item.data.isActive ? "Current space" : "Space"}
                  </span>
                </div>
              </>
            ) : (
              <TabSearchRow
                tab={item.data}
                timer={timers.get(tabBrowserId(item.data) ?? -1)}
                timerOpen={timerTabId !== null && timerTabId === tabBrowserId(item.data)}
                compact={compact}
                onToggleTimer={() => {
                  const tabId = tabBrowserId(item.data);
                  if (tabId !== undefined) {
                    setTimerTabId(timerTabId === tabId ? null : tabId);
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
        ))}
      </ul>
      {(loadError || (items.length === 0 && tabs.length + spaces.length > 0)) && (
        <div class="text-zen-muted px-1 py-3 text-center text-xs">
          {loadError || "No tabs or spaces found."}
        </div>
      )}
      {!loadError && tabs.length + spaces.length === 0 && (
        <div class="text-zen-muted px-1 py-3 text-center text-xs">Loading tabs and spaces…</div>
      )}
    </SearchShell>
  );
}
