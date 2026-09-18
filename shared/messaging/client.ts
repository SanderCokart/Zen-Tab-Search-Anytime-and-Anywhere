import type { ForgePageInfo } from "@/features/forge/model/forge-label";
import { subscribeToDisplaySettingsChanged as subscribeToStoredDisplaySettingsChanged } from "@/features/settings/model/display-settings";
import {
  type ContentCommand,
  type ExtensionRequest,
  type ExtensionRequestType,
  type ExtensionSuccessMap,
  forgePageInfoSchema,
  isErrorResponse,
  isSnapshotChangedMessage,
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

export function subscribeToDisplaySettingsChanged(
  onChanged: (settings: import("@/features/settings/model/display-settings").DisplaySettings) => void,
): () => void {
  return subscribeToStoredDisplaySettingsChanged(onChanged);
}
