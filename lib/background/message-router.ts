import { isUsableTabId } from "../types";
import {
  type ExtensionRequest,
  invalidRequestMessage,
  isExtensionRequestType,
  parseExtensionRequest,
} from "../messaging/protocol";

export interface MessageRouterHandlers {
  queryTabs(anchorTabId?: number): Promise<unknown>;
  getSpaces(anchorTabId?: number): Promise<unknown>;
  getDebugInfo(anchorTabId?: number): Promise<unknown>;
  switchTab(tabId?: number, domId?: string, anchorTabId?: number): Promise<void>;
  switchSpace(spaceId: string, anchorTabId?: number): Promise<void>;
  getTab(tabId: number): Promise<unknown>;
  getSnapshot(anchorTabId?: number): Promise<unknown>;
  getTimers(): Promise<unknown>;
  setTimer(tabId: number, endAt: number): Promise<unknown>;
  clearTimer(tabId: number): Promise<boolean>;
  clearAllTimers(): Promise<number>;
  isAllowedTimerEnd(endAt: number): boolean;
}

export interface MessageSender {
  tab?: {
    id?: number;
    url?: string;
  };
}

export type DispatchResult =
  | { handled: false }
  | { handled: true; async: false; response: unknown }
  | { handled: true; async: true; promise: Promise<unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidTabId(value: unknown): value is number {
  return isUsableTabId(value);
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

function resolveEndAt(message: Extract<ExtensionRequest, { type: "setTimer" }>): number {
  if (typeof message.endAt === "number") {
    return message.endAt;
  }
  if (typeof message.durationMinutes === "number") {
    return Date.now() + message.durationMinutes * 60_000;
  }
  return Number.NaN;
}

function handleParsedRequest(
  handlers: MessageRouterHandlers,
  message: ExtensionRequest,
  sender: MessageSender,
): Promise<unknown> {
  const senderTabId = isUsableSenderTab(sender.tab) ? sender.tab?.id : undefined;
  const anchorTabId =
    "anchorTabId" in message && message.anchorTabId !== undefined
      ? message.anchorTabId
      : senderTabId;

  switch (message.type) {
    case "getTabs":
      return handlers.queryTabs(anchorTabId);
    case "getSpaces":
      return handlers.getSpaces(anchorTabId);
    case "getDebugInfo":
      return handlers.getDebugInfo(anchorTabId);
    case "switchTab":
      return handlers.switchTab(message.tabId, message.domId, anchorTabId);
    case "switchSpace":
      return handlers.switchSpace(message.spaceId, anchorTabId);
    case "getTab":
      return handlers.getTab(message.tabId);
    case "getSnapshot":
      return handlers.getSnapshot(anchorTabId);
    case "getTimers":
      return handlers.getTimers();
    case "setTimer": {
      const endAt = resolveEndAt(message);
      if (!handlers.isAllowedTimerEnd(endAt)) {
        return Promise.resolve({
          error: "Timer duration must be between 1 minute and 31 days.",
        });
      }
      return handlers.setTimer(message.tabId, endAt);
    }
    case "clearTimer":
      return handlers.clearTimer(message.tabId).then((cleared) => ({ success: true, cleared }));
    case "clearAllTimers":
      return handlers.clearAllTimers().then((cleared) => ({ success: true, cleared }));
  }
}

export function dispatchExtensionMessage(
  handlers: MessageRouterHandlers,
  rawMessage: unknown,
  sender: MessageSender = {},
): DispatchResult {
  if (!isRecord(rawMessage)) {
    return { handled: true, async: false, response: { error: "Invalid message." } };
  }

  const type = rawMessage.type;
  if (!isExtensionRequestType(type)) {
    return { handled: false };
  }

  let message: ExtensionRequest;
  try {
    message = parseExtensionRequest(rawMessage);
  } catch {
    return {
      handled: true,
      async: false,
      response: { error: invalidRequestMessage(type) },
    };
  }

  return {
    handled: true,
    async: true,
    promise: handleParsedRequest(handlers, message, sender),
  };
}

export function registerMessageRouter(handlers: MessageRouterHandlers): void {
  browser.runtime.onMessage.addListener(
    (rawMessage: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => {
      const result = dispatchExtensionMessage(handlers, rawMessage, sender);
      if (!result.handled) {
        return false;
      }
      if (!result.async) {
        sendResponse(result.response);
        return false;
      }

      result.promise
        .then((value) => sendResponse(value))
        .catch((error) => sendResponse({ error: formatError(error) }));
      return true;
    },
  );
}
