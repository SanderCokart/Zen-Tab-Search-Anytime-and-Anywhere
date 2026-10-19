import type { DisplaySettings } from "@/features/settings/model/display-settings";
import type { ExtensionRequest, SearchSnapshot } from "@/shared/messaging/protocol";
import type { HostOverrideGroup, TabInfo } from "@/shared/types";
import {
  DEMO_GLOBAL_HOST_GROUPS,
  DEMO_HOST_GROUPS,
  DEMO_PROXY_REPORT,
  DEMO_TABS,
  demoSnapshot,
  demoStorage,
} from "@/screenshots/demo-data";

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  area: string,
) => void;

type MessageListener = (message: unknown) => unknown;

function isRequest(message: unknown): message is ExtensionRequest {
  return Boolean(message && typeof message === "object" && "type" in message);
}

function pickStorage(
  store: Record<string, unknown>,
  keys: string | string[] | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (keys == null) {
    return { ...store };
  }
  if (typeof keys === "string") {
    return { [keys]: store[keys] };
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, store[key]]));
  }
  return Object.fromEntries(Object.keys(keys).map((key) => [key, store[key] ?? keys[key]]));
}

/**
 * Stands in for the background script so the real UI can render without Zen.
 * Snapshot, storage and host-override replies come from the demo fixtures.
 */
export function installBrowserMock(displaySettings: DisplaySettings): void {
  const snapshot: SearchSnapshot = demoSnapshot();
  const store: Record<string, unknown> = demoStorage(displaySettings);
  let tabGroups = DEMO_HOST_GROUPS.map((group) => ({ ...group }));
  let globalGroups = DEMO_GLOBAL_HOST_GROUPS.map((group) => ({ ...group }));
  const storageListeners = new Set<StorageChangeListener>();
  const messageListeners = new Set<MessageListener>();

  const reply = (message: ExtensionRequest): unknown => {
    switch (message.type) {
      case "getSnapshot":
        return snapshot;
      case "getTabs":
        return snapshot.tabs;
      case "getSpaces":
        return snapshot.spaces;
      case "getTimers":
        return snapshot.timers;
      case "getTab":
        return snapshot.tabs.find((tab) => tab.id === message.tabId) ?? fallbackTab(message.tabId);
      case "getHostOverrides":
        return tabGroups;
      case "getGlobalHostOverrides":
        return globalGroups;
      case "setHostOverrides":
        tabGroups = message.groups as HostOverrideGroup[];
        return tabGroups;
      case "setGlobalHostOverrides":
        globalGroups = message.groups as HostOverrideGroup[];
        return globalGroups;
      case "getHostProxyStatus":
        return DEMO_PROXY_REPORT;
      case "setTimer":
        return {
          tabId: message.tabId,
          endAt: message.endAt ?? Date.now() + 30 * 60_000,
          originalLabel: "",
          title: "",
        };
      case "clearTimer":
        return { success: true as const, cleared: true };
      case "clearAllTimers":
        return { success: true as const, cleared: snapshot.timers.length };
      case "switchTab":
      case "switchSpace":
      case "openTimerPopup":
      case "openSettings":
      case "openHostOverridesPopup":
      case "hideOmnibar":
      case "setTabLabel":
      case "setTodo":
      case "setTabStatus":
      case "clearTodos":
      case "getDebugInfo":
        return undefined;
      default: {
        const exhaustive: never = message;
        throw new Error(`Unhandled harness message: ${JSON.stringify(exhaustive)}`);
      }
    }
  };

  const local = {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      return pickStorage(store, keys);
    },
    async set(items: Record<string, unknown>) {
      const changes: Record<string, { newValue?: unknown; oldValue?: unknown }> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: store[key], newValue: value };
        store[key] = value;
      }
      for (const listener of storageListeners) {
        listener(changes, "local");
      }
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, { newValue?: unknown; oldValue?: unknown }> = {};
      for (const key of list) {
        changes[key] = { oldValue: store[key], newValue: undefined };
        delete store[key];
      }
      for (const listener of storageListeners) {
        listener(changes, "local");
      }
    },
  };

  Object.assign(globalThis, {
    browser: {
      runtime: {
        sendMessage: async (message: unknown) => {
          if (!isRequest(message)) {
            return undefined;
          }
          return reply(message);
        },
        onMessage: {
          addListener: (listener: MessageListener) => {
            messageListeners.add(listener);
          },
          removeListener: (listener: MessageListener) => {
            messageListeners.delete(listener);
          },
        },
        getURL: (path: string) => path,
      },
      storage: {
        local,
        onChanged: {
          addListener: (listener: StorageChangeListener) => {
            storageListeners.add(listener);
          },
          removeListener: (listener: StorageChangeListener) => {
            storageListeners.delete(listener);
          },
        },
      },
    },
  });
}

function fallbackTab(tabId: number): TabInfo {
  return DEMO_TABS[0] ?? { id: tabId, title: "Tab", url: "", favIconUrl: "", windowId: 1 };
}
