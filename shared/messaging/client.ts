import {
  type ContentCommand,
  type ExtensionRequest,
  type ExtensionRequestType,
  type ExtensionSuccessMap,
  type ForgePageInfo,
  type OmnibarShown,
  forgePageInfoSchema,
  isErrorResponse,
  isSnapshotChangedMessage,
  parseOmnibarShownMessage,
  parseExtensionSuccess,
} from "@/shared/messaging/protocol";
import * as v from "valibot";

export class ExtensionMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionMessageError";
  }
}

export async function sendExtensionMessage<T extends ExtensionRequestType>(
  message: Extract<ExtensionRequest, { type: T }>,
): Promise<ExtensionSuccessMap[T]> {
  const response: unknown = await browser.runtime.sendMessage(message);
  if (isErrorResponse(response)) {
    throw new ExtensionMessageError(response.error);
  }
  // The snapshot is validated in the background so the overlay/popup thread
  // does not walk every tab through valibot on the typing/hot path.
  if (message.type === "getSnapshot") {
    return response as ExtensionSuccessMap[T];
  }
  return parseExtensionSuccess(message.type, response);
}

export async function sendTabMessage<T extends ContentCommand["type"]>(
  tabId: number,
  message: Extract<ContentCommand, { type: T }>,
): Promise<T extends "getForgePageInfo" ? ForgePageInfo : void> {
  const response: unknown = await browser.tabs.sendMessage(tabId, message);
  if (message.type === "getForgePageInfo") {
    return v.parse(forgePageInfoSchema, response ?? {}) as T extends "getForgePageInfo"
      ? ForgePageInfo
      : void;
  }
  return undefined as T extends "getForgePageInfo" ? ForgePageInfo : void;
}

export function subscribeToSnapshotChanged(onChanged: () => void): () => void {
  const listener = (message: unknown) => {
    if (isSnapshotChangedMessage(message)) {
      onChanged();
    }
  };
  browser.runtime.onMessage.addListener(listener);
  return () => {
    browser.runtime.onMessage.removeListener(listener);
  };
}

/**
 * Calls `onShown` before the window-hosted omnibar is shown. When it returns
 * true, the reply waits a task so the re-render commits before the background
 * makes the overlay visible.
 */
export function subscribeToOmnibarShown(onShown: (shown: OmnibarShown) => boolean): () => void {
  const listener = (message: unknown) => {
    const shown = parseOmnibarShownMessage(message);
    if (shown === undefined || !onShown(shown)) {
      return undefined;
    }
    return new Promise<true>((resolve) => setTimeout(() => resolve(true), 0));
  };
  browser.runtime.onMessage.addListener(listener);
  return () => {
    browser.runtime.onMessage.removeListener(listener);
  };
}
