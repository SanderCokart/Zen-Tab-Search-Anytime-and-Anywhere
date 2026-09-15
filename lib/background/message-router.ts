export interface MessageRouterHandlers {
  queryTabs(anchorTabId?: number): Promise<unknown>;
  getSpaces(anchorTabId?: number): Promise<unknown>;
  getDebugInfo(anchorTabId?: number): Promise<unknown>;
  switchTab(tabId?: number, domId?: string, anchorTabId?: number): Promise<void>;
  switchSpace(spaceId: string, anchorTabId?: number): Promise<void>;
  getTab(tabId: number): Promise<unknown>;
  getTimers(): Promise<unknown>;
  setTimer(tabId: number, endAt: number): Promise<unknown>;
  clearTimer(tabId: number): Promise<boolean>;
  clearAllTimers(): Promise<number>;
  isAllowedTimerEnd(endAt: number): boolean;
}

type Message = Record<string, unknown>;

interface MessageSender {
  tab?: {
    id?: number;
    url?: string;
  };
}

function isRecord(value: unknown): value is Message {
  return typeof value === "object" && value !== null;
}

function isValidTabId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function asOptionalTabId(value: unknown): number | undefined {
  return isValidTabId(value) ? value : undefined;
}

function isUsableSenderTab(tab: MessageSender["tab"]): boolean {
  return (
    isValidTabId(tab?.id) &&
    !tab?.url?.startsWith("moz-extension:") &&
    !tab?.url?.startsWith("chrome-extension:")
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }
  return String(error);
}

function respondAsync<T>(
  operation: Promise<T>,
  sendResponse: (response?: unknown) => void,
): boolean {
  operation
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ error: formatError(error) }));
  return true;
}

export function registerMessageRouter(handlers: MessageRouterHandlers): void {
  browser.runtime.onMessage.addListener(
    (rawMessage: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => {
      if (!isRecord(rawMessage)) {
        sendResponse({ error: "Invalid message." });
        return false;
      }

      const message = rawMessage;
      const senderTabId = isUsableSenderTab(sender.tab) ? sender.tab?.id : undefined;
      const anchorTabId = asOptionalTabId(message.anchorTabId) ?? senderTabId;
      const type = typeof message.type === "string" ? message.type : "";

      switch (type) {
        case "getTabs":
          return respondAsync(handlers.queryTabs(anchorTabId), sendResponse);
        case "getSpaces":
          return respondAsync(handlers.getSpaces(anchorTabId), sendResponse);
        case "getDebugInfo":
          return respondAsync(handlers.getDebugInfo(anchorTabId), sendResponse);
        case "switchTab": {
          const tabId = asOptionalTabId(message.tabId);
          const domId = typeof message.domId === "string" ? message.domId : undefined;
          return respondAsync(handlers.switchTab(tabId, domId, anchorTabId), sendResponse);
        }
        case "switchSpace":
          if (typeof message.spaceId !== "string" || !message.spaceId) {
            sendResponse({ error: "Invalid space ID." });
            return false;
          }
          return respondAsync(handlers.switchSpace(message.spaceId, anchorTabId), sendResponse);
        case "getTab": {
          const tabId = asOptionalTabId(message.tabId);
          if (tabId === undefined) {
            sendResponse({ error: "No tab selected for the timer." });
            return false;
          }
          return respondAsync(handlers.getTab(tabId), sendResponse);
        }
        case "getTimers":
          return respondAsync(handlers.getTimers(), sendResponse);
        case "setTimer": {
          const tabId = asOptionalTabId(message.tabId);
          const explicitEndAt = typeof message.endAt === "number" ? message.endAt : undefined;
          const durationMinutes =
            typeof message.durationMinutes === "number" ? message.durationMinutes : undefined;
          const endAt = explicitEndAt ?? Date.now() + (durationMinutes ?? Number.NaN) * 60_000;
          if (tabId === undefined || !handlers.isAllowedTimerEnd(endAt)) {
            sendResponse({ error: "Timer duration must be between 1 minute and 31 days." });
            return false;
          }
          return respondAsync(handlers.setTimer(tabId, endAt), sendResponse);
        }
        case "clearTimer": {
          const tabId = asOptionalTabId(message.tabId);
          if (tabId === undefined) {
            sendResponse({ error: "Invalid tab ID." });
            return false;
          }
          return respondAsync(
            handlers.clearTimer(tabId).then((cleared) => ({ success: true, cleared })),
            sendResponse,
          );
        }
        case "clearAllTimers":
          return respondAsync(
            handlers.clearAllTimers().then((cleared) => ({ success: true, cleared })),
            sendResponse,
          );
        default:
          return false;
      }
    },
  );
}
