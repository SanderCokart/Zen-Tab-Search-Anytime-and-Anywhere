import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { debugError } from "../../lib/debug";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "../../lib/messaging/client";
import { buildSearchItems, filterSearchItems, prioritizeCurrentTab } from "../../lib/search";
import {
  formatTimerCountdown,
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  stripTimerPrefix,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "../../lib/timer";
import type { SearchItem, SpaceInfo, TabInfo, TabTimer } from "../../lib/types";
import { formatSpaceDisplayTitle, formatTabDisplayTitle, isActivatableTab } from "../../lib/types";

export interface SearchAppProps {
  onClose: () => void;
  pageJump?: number;
}

function TimerIcon({ close = false }: { close?: boolean }) {
  return (
    <svg class="zen-timer-icon" viewBox="0 0 24 24" aria-hidden="true">
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

function TimerPanel({
  tab,
  timer,
  onSet,
  onClear,
}: {
  tab: TabInfo;
  timer?: TabTimer;
  onSet: (endAt: number) => void;
  onClear: () => void;
}) {
  const [endAt, setEndAt] = useState(timer?.endAt ?? Date.now() + 30 * 60_000);
  const valid = isAllowedTimerEnd(endAt);
  const tabId = tab.id!;

  return (
    <div class="zen-timer-panel" onClick={(event) => event.stopPropagation()}>
      <div class="zen-timer-presets">
        {TIMER_PRESETS.map((preset) => (
          <button
            type="button"
            class="zen-timer-preset"
            onClick={() => setEndAt(preset.endAt(new Date()))}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label class="zen-timer-field">
        Ends at
        <input
          class="zen-timer-input"
          type="datetime-local"
          step="60"
          min={toDatetimeLocalValue(Date.now() + 60_000)}
          max={toDatetimeLocalValue(Date.now() + MAX_TIMER_MS)}
          value={toDatetimeLocalValue(endAt)}
          onInput={(event) => setEndAt(fromDatetimeLocalValue(event.currentTarget.value))}
        />
      </label>
      <p class="zen-timer-preview">
        {valid
          ? formatTimerCountdown(endAt)
          : "Choose a time between 1 minute and 31 days from now."}
      </p>
      <div class="zen-timer-actions">
        <button
          type="button"
          class="zen-timer-button"
          disabled={!valid}
          onClick={() => onSet(endAt)}
        >
          Set timer
        </button>
        {timer && (
          <button type="button" class="zen-timer-button zen-timer-clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <input type="hidden" value={tabId} />
    </div>
  );
}

export function SearchApp({ onClose, pageJump = 5 }: SearchAppProps) {
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
    const activeId = tabs.find(
      (tab): tab is TabInfo & { id: number } =>
        tab.active === true && tab.id !== null && Number.isInteger(tab.id) && tab.id >= 0,
    )?.id;
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
      tabId:
        Number.isInteger(item.data.id) && item.data.id !== null && item.data.id >= 0
          ? item.data.id
          : undefined,
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
    <div class="zen-popup">
      <div class="zen-search-row">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search tabs and spaces..."
          class="zen-input"
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
          class="zen-timer-button zen-timer-icon-button"
          title={showTimers ? "Close active timers" : "Show active timers"}
          onClick={() => setShowTimers(!showTimers)}
        >
          <TimerIcon close={showTimers} />
          {!showTimers && timers.size > 0 && <span class="zen-timer-badge">{timers.size}</span>}
        </button>
      </div>
      {showTimers && (
        <div class="zen-active-timers">
          <div class="zen-active-timers-header">
            <strong>Active timers</strong>
            {timers.size > 0 && (
              <button
                type="button"
                class="zen-timer-button zen-timer-clear"
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
            <p class="zen-active-timers-empty">No active timers.</p>
          ) : (
            <ul class="zen-active-timers-list">
              {[...timers.values()]
                .sort((a, b) => a.endAt - b.endAt)
                .map((timer) => (
                  <li class="zen-active-timer">
                    <button
                      type="button"
                      class="zen-active-timer-tab"
                      onClick={() =>
                        void sendExtensionMessage({ type: "switchTab", tabId: timer.tabId }).then(
                          onClose,
                        )
                      }
                    >
                      <span class="zen-active-timer-title">
                        {timer.title || timer.originalLabel || `Tab ${timer.tabId}`}
                      </span>
                      <span class="zen-timer-countdown">⏱ {formatTimerCountdown(timer.endAt)}</span>
                    </button>
                    <button
                      type="button"
                      class="zen-timer-button zen-timer-clear"
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
      <ul class="zen-list" role="listbox">
        {items.map((item, index) => (
          <li
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            class={`zen-tab-item ${item.kind === "space" ? "zen-space-item" : ""} ${selectedIndex === index ? "selected" : ""}`}
            role="option"
            aria-selected={selectedIndex === index}
            onClick={() => activateItem(item)}
          >
            {item.kind === "space" ? (
              <>
                <span class="zen-space-icon">{item.data.icon?.trim() || "◆"}</span>
                <div class="zen-text">
                  <span class="zen-title">{formatSpaceDisplayTitle(item.data)}</span>
                  <span class="zen-url">{item.data.isActive ? "Current space" : "Space"}</span>
                </div>
              </>
            ) : (
              <>
                {item.data.favIconUrl && <img src={item.data.favIconUrl} class="zen-favicon" />}
                <div class="zen-text">
                  <div class="zen-tab-timer-block">
                    <div class="zen-title-row">
                      <span class="zen-title">
                        {formatTabDisplayTitle({
                          ...item.data,
                          customLabel: stripTimerPrefix(item.data.customLabel || ""),
                        })}
                      </span>
                      <span class="zen-timer">
                        {timers.get(item.data.id ?? -1) && (
                          <span class="zen-timer-countdown">
                            ⏱ {formatTimerCountdown(timers.get(item.data.id ?? -1)!.endAt)}
                          </span>
                        )}
                        {Number.isInteger(item.data.id) && item.data.id! >= 0 && (
                          <button
                            type="button"
                            class="zen-timer-button zen-timer-icon-button"
                            title="Set a timer for this tab"
                            onClick={(event) => {
                              event.stopPropagation();
                              setTimerTabId(timerTabId === item.data.id ? null : item.data.id);
                            }}
                          >
                            <TimerIcon close={timerTabId === item.data.id} />
                          </button>
                        )}
                      </span>
                    </div>
                    {timerTabId === item.data.id && (
                      <TimerPanel
                        tab={item.data}
                        timer={timers.get(item.data.id!)}
                        onSet={(endAt) => setTimer(item.data.id!, endAt)}
                        onClear={() => clearTimer(item.data.id!)}
                      />
                    )}
                  </div>
                  <span class="zen-url">
                    {item.data.active
                      ? `${item.data.workspaceName || hostname(item.data.url)} · Current tab`
                      : item.data.workspaceName || hostname(item.data.url)}
                  </span>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {(loadError || (items.length === 0 && tabs.length + spaces.length > 0)) && (
        <div class="zen-empty">{loadError || "No tabs or spaces found."}</div>
      )}
      {!loadError && tabs.length + spaces.length === 0 && (
        <div class="zen-empty">Loading tabs and spaces…</div>
      )}
    </div>
  );
}
