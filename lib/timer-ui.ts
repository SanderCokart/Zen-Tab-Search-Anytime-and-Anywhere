import { debugError } from "./debug";
import {
  formatTimerClock,
  formatTimerCountdown,
  fromDatetimeLocalValue,
  isAllowedTimerEnd,
  MAX_TIMER_MS,
  stripTimerPrefix,
  TIMER_PRESETS,
  toDatetimeLocalValue,
} from "./timer";
import { sendExtensionMessage } from "./messaging/client";
import type { TabInfo, TabTimer } from "./types";
import { formatTabDisplayTitle } from "./types";

export interface TimerUiController {
  timers: Map<number, TabTimer>;
  openTimerTabs: Set<number>;
  timerDrafts: Map<number, number>;
  onChange: () => void;
}

function createSvgIcon(...pathData: string[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("zen-timer-icon");
  for (const d of pathData) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

export function createTimerIcon(): SVGSVGElement {
  const svg = createSvgIcon("M12 9v4l2.5 1.5", "M9 3h6M12 3v2");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "13");
  circle.setAttribute("r", "8");
  svg.insertBefore(circle, svg.firstChild);
  return svg;
}

export function createCloseIcon(): SVGSVGElement {
  return createSvgIcon("M6 6l12 12M18 6L6 18");
}

function timerForTab(controller: TimerUiController, tab: TabInfo): TabTimer | undefined {
  return Number.isInteger(tab.id) && tab.id! >= 0 ? controller.timers.get(tab.id!) : undefined;
}

function draftEndAt(controller: TimerUiController, tabId: number, timer?: TabTimer): number {
  return controller.timerDrafts.get(tabId) ?? timer?.endAt ?? Date.now() + 30 * 60_000;
}

export function applyTimerSet(controller: TimerUiController, timer: TabTimer): void {
  controller.timers.set(timer.tabId, timer);
  controller.openTimerTabs.delete(timer.tabId);
  controller.timerDrafts.delete(timer.tabId);
  controller.onChange();
}

export function applyTimerCleared(controller: TimerUiController, tabId: number): void {
  controller.timers.delete(tabId);
  controller.openTimerTabs.delete(tabId);
  controller.timerDrafts.delete(tabId);
  controller.onChange();
}

export function createIconButton(options: {
  title: string;
  icon: SVGSVGElement;
  onClick: (event: MouseEvent) => void;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "zen-timer-button zen-timer-icon-button";
  button.type = "button";
  button.title = options.title;
  button.setAttribute("aria-label", options.title);
  button.appendChild(options.icon);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onClick(event);
  });
  return button;
}

export function renderTimerToggle(
  container: HTMLElement,
  tab: TabInfo,
  controller: TimerUiController,
): void {
  if (!Number.isInteger(tab.id) || tab.id! < 0) {
    return;
  }

  const tabId = tab.id!;
  const timer = timerForTab(controller, tab);
  const open = controller.openTimerTabs.has(tabId);
  const timerEl = document.createElement("div");
  timerEl.className = "zen-timer";
  timerEl.addEventListener("click", (event) => event.stopPropagation());

  if (timer) {
    const countdown = document.createElement("span");
    countdown.className = "zen-timer-countdown";
    countdown.dataset.endAt = String(timer.endAt);
    countdown.textContent = `⏱ ${formatTimerClock(timer.endAt - Date.now())}`;
    timerEl.appendChild(countdown);
  }

  timerEl.appendChild(
    createIconButton({
      title: open ? "Close timer settings" : "Set a timer for this tab",
      icon: open ? createCloseIcon() : createTimerIcon(),
      onClick: () => {
        if (open) {
          controller.openTimerTabs.delete(tabId);
        } else {
          controller.openTimerTabs.add(tabId);
          if (!controller.timerDrafts.has(tabId)) {
            controller.timerDrafts.set(tabId, draftEndAt(controller, tabId, timer));
          }
        }
        controller.onChange();
      },
    }),
  );
  container.appendChild(timerEl);
}

export function renderTimerPanel(tab: TabInfo, controller: TimerUiController): HTMLElement {
  const tabId = tab.id!;
  const timer = timerForTab(controller, tab);
  const panel = document.createElement("div");
  panel.className = "zen-timer-panel";
  panel.addEventListener("click", (event) => event.stopPropagation());

  const endsAt = document.createElement("input");
  endsAt.className = "zen-timer-input";
  endsAt.type = "datetime-local";
  endsAt.step = "60";
  endsAt.title = "Timer end time";
  endsAt.setAttribute("aria-label", "Timer end time");
  const now = Date.now();
  endsAt.min = toDatetimeLocalValue(now + 60_000);
  endsAt.max = toDatetimeLocalValue(now + MAX_TIMER_MS);
  endsAt.value = toDatetimeLocalValue(draftEndAt(controller, tabId, timer));

  const preview = document.createElement("p");
  preview.className = "zen-timer-preview";

  function updatePreview(): void {
    const endAt = fromDatetimeLocalValue(endsAt.value);
    controller.timerDrafts.set(tabId, endAt);
    preview.textContent = isAllowedTimerEnd(endAt)
      ? formatTimerCountdown(endAt)
      : "Choose a time between 1 minute and 31 days from now.";
  }

  const presets = document.createElement("div");
  presets.className = "zen-timer-presets";
  for (const preset of TIMER_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zen-timer-preset";
    button.textContent = preset.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const endAt = preset.endAt(new Date());
      controller.timerDrafts.set(tabId, endAt);
      endsAt.value = toDatetimeLocalValue(endAt);
      updatePreview();
    });
    presets.appendChild(button);
  }
  panel.appendChild(presets);

  endsAt.addEventListener("input", () => updatePreview());
  updatePreview();

  const field = document.createElement("label");
  field.className = "zen-timer-field";
  field.append("Ends at", endsAt);
  panel.appendChild(field);
  panel.appendChild(preview);

  const actions = document.createElement("div");
  actions.className = "zen-timer-actions";

  const set = document.createElement("button");
  set.className = "zen-timer-button";
  set.type = "button";
  set.textContent = "Set timer";
  set.addEventListener("click", (event) => {
    event.stopPropagation();
    const endAt = fromDatetimeLocalValue(endsAt.value);
    if (!isAllowedTimerEnd(endAt)) {
      endsAt.focus();
      updatePreview();
      return;
    }
    void sendExtensionMessage({ type: "setTimer", tabId, endAt })
      .then((timer) => applyTimerSet(controller, timer))
      .catch((error) => debugError("Could not update timer:", error));
  });
  actions.appendChild(set);

  if (timer) {
    const clear = document.createElement("button");
    clear.className = "zen-timer-button zen-timer-clear";
    clear.type = "button";
    clear.textContent = "Clear";
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      void sendExtensionMessage({ type: "clearTimer", tabId })
        .then(() => applyTimerCleared(controller, tabId))
        .catch((error) => debugError("Could not update timer:", error));
    });
    actions.appendChild(clear);
  }

  panel.appendChild(actions);
  return panel;
}

export function renderTabTimerBlock(tab: TabInfo, controller: TimerUiController): HTMLElement {
  const tabBlock = document.createElement("div");
  tabBlock.className = "zen-tab-timer-block";

  const titleRow = document.createElement("div");
  titleRow.className = "zen-title-row";

  const title = document.createElement("span");
  title.textContent = formatTabDisplayTitle({
    ...tab,
    customLabel: stripTimerPrefix(tab.customLabel || ""),
  });
  title.className = "zen-title";
  titleRow.appendChild(title);
  renderTimerToggle(titleRow, tab, controller);
  tabBlock.appendChild(titleRow);

  if (Number.isInteger(tab.id) && controller.openTimerTabs.has(tab.id!)) {
    tabBlock.appendChild(renderTimerPanel(tab, controller));
  }

  return tabBlock;
}

export function tickTimerDisplays(root: ParentNode, now = Date.now()): void {
  root.querySelectorAll<HTMLElement>(".zen-timer-countdown").forEach((countdown) => {
    const endAt = Number(countdown.dataset.endAt);
    if (Number.isFinite(endAt)) {
      countdown.textContent = `⏱ ${formatTimerClock(endAt - now)}`;
    }
  });
  root.querySelectorAll<HTMLInputElement>("input[type='datetime-local']").forEach((field) => {
    const preview = field.closest(".zen-timer-field")?.nextElementSibling;
    if (!(preview instanceof HTMLElement) || !preview.classList.contains("zen-timer-preview")) {
      return;
    }
    const endAt = fromDatetimeLocalValue(field.value);
    preview.textContent = isAllowedTimerEnd(endAt, now)
      ? formatTimerCountdown(endAt, now)
      : "Choose a time between 1 minute and 31 days from now.";
  });
}

export function renderActiveTimersPanel(
  container: HTMLElement,
  controller: TimerUiController,
  options: {
    onActivateTab?: (tabId: number) => void;
  } = {},
): void {
  container.innerHTML = "";
  container.className = "zen-active-timers";

  const heading = document.createElement("div");
  heading.className = "zen-active-timers-header";
  const title = document.createElement("strong");
  title.textContent = "Active timers";
  heading.appendChild(title);

  const timers = [...controller.timers.values()].sort((a, b) => a.endAt - b.endAt);
  if (timers.length > 0) {
    const clearAll = document.createElement("button");
    clearAll.className = "zen-timer-button zen-timer-clear";
    clearAll.type = "button";
    clearAll.textContent = "Clear all";
    clearAll.addEventListener("click", (event) => {
      event.stopPropagation();
      void sendExtensionMessage({ type: "clearAllTimers" })
        .then(() => {
          controller.timers.clear();
          controller.openTimerTabs.clear();
          controller.timerDrafts.clear();
          controller.onChange();
        })
        .catch((error) => debugError("Could not clear timers:", error));
    });
    heading.appendChild(clearAll);
  }
  container.appendChild(heading);

  if (timers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "zen-active-timers-empty";
    empty.textContent = "No active timers.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "zen-active-timers-list";
  for (const timer of timers) {
    const item = document.createElement("li");
    item.className = "zen-active-timer";
    item.addEventListener("click", (event) => event.stopPropagation());

    const text = document.createElement("button");
    text.type = "button";
    text.className = "zen-active-timer-tab";
    const name = document.createElement("span");
    name.className = "zen-active-timer-title";
    name.textContent = timer.title || timer.originalLabel || `Tab ${timer.tabId}`;
    const countdown = document.createElement("span");
    countdown.className = "zen-timer-countdown";
    countdown.dataset.endAt = String(timer.endAt);
    countdown.textContent = formatTimerCountdown(timer.endAt);
    text.append(name, countdown);
    if (options.onActivateTab) {
      text.addEventListener("click", () => options.onActivateTab!(timer.tabId));
    } else {
      text.disabled = true;
    }

    const clear = document.createElement("button");
    clear.className = "zen-timer-button zen-timer-clear";
    clear.type = "button";
    clear.textContent = "Clear";
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      void sendExtensionMessage({ type: "clearTimer", tabId: timer.tabId })
        .then(() => applyTimerCleared(controller, timer.tabId))
        .catch((error) => debugError("Could not update timer:", error));
    });

    item.append(text, clear);
    list.appendChild(item);
  }
  container.appendChild(list);
}

export function syncActiveTimersButton(
  button: HTMLButtonElement,
  count: number,
  open: boolean,
): void {
  button.replaceChildren(open ? createCloseIcon() : createTimerIcon());
  button.title = open ? "Close active timers" : "Show active timers";
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("has-timers", count > 0);
  if (count > 0 && !open) {
    const badge = document.createElement("span");
    badge.className = "zen-timer-badge";
    badge.textContent = String(count);
    button.appendChild(badge);
  }
}
