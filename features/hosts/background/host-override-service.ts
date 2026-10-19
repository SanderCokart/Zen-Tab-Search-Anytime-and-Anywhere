import * as v from "valibot";
import { debugLog, debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { hostOverrideListSchema, type HostProxyReport } from "@/shared/messaging/protocol";
import { createTabSessionValues } from "@/shared/tab-session-values";
import { isUsableTabId, type HostOverrideGroup } from "@/shared/types";
import {
  findHostOverride,
  formatHostOverrideNotice,
  formatHostOverrideSummary,
  hostnameOf,
  setGroupEnabled,
  validateHostOverrides,
  type HostOverrideScope,
} from "@/features/hosts/model/host-override";
import { createHostProxyPorts, type HostProxyPorts } from "@/features/hosts/background/host-proxy";

/** Firefox's `proxy.onRequest` result. Returning nothing keeps the browser's own proxy settings. */
interface ProxyInfo {
  type: "http";
  host: string;
  port: number;
}

type ProxyResult = ProxyInfo | undefined;

interface ProxyRequestDetails {
  tabId: number;
  url: string;
}

const NOTIFICATION_PREFIX = "host-override:";
const GLOBAL_STORAGE_KEY = "globalHostOverrides";

function loopbackProxy(port: number): ProxyInfo {
  return { type: "http", host: "127.0.0.1", port };
}

/**
 * When the proxy for a group cannot start, its traffic goes here instead of to
 * the real host: the request fails with a proxy error rather than silently
 * reaching the server the user meant to avoid.
 */
const DEAD_PROXY = loopbackProxy(9);

/** The tab a host override notification is about, or undefined for any other notification. */
export function parseHostOverrideNotificationTabId(notificationId: string): number | undefined {
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) {
    return undefined;
  }
  const tabId = Number(notificationId.slice(NOTIFICATION_PREFIX.length).split(":")[0]);
  return isUsableTabId(tabId) ? tabId : undefined;
}

export interface HostOverrideServiceDeps {
  ports?: HostProxyPorts;
  /** Shows a notification; the toolbar badge and tooltip are set separately. */
  notify?(id: string, title: string, message: string): Promise<void>;
  /**
   * Marks the toolbar button while routes are on, or clears it with an empty
   * summary. Without a tab it sets the button's default, which global routes use.
   */
  setIndicator?(tabId: number | undefined, summary: string): Promise<void>;
  readGlobal?(): Promise<unknown>;
  writeGlobal?(groups: HostOverrideGroup[]): Promise<void>;
}

/** A plain notification with the extension's icon. An empty ID lets the browser pick one. */
export async function showNotification(id: string, title: string, message: string): Promise<void> {
  const options = {
    type: "basic" as const,
    iconUrl: browser.runtime.getURL("/icon/48.png"),
    title,
    message,
  };
  await (id ? browser.notifications.create(id, options) : browser.notifications.create(options));
}

async function setToolbarIndicator(tabId: number | undefined, summary: string): Promise<void> {
  const browserAction = browser.browserAction as unknown as {
    setBadgeText(details: { tabId?: number; text: string | null }): Promise<void>;
    setBadgeBackgroundColor(details: { tabId?: number; color: string | null }): Promise<void>;
    setTitle(details: { tabId?: number; title: string | null }): Promise<void>;
  };
  // For a tab, null hands it back to the button's default badge and title. The
  // default itself is cleared with an empty badge and the manifest's title.
  await Promise.all([
    browserAction.setBadgeText({ tabId, text: summary ? "⇄" : tabId === undefined ? "" : null }),
    browserAction.setBadgeBackgroundColor({ tabId, color: summary ? "#b45309" : null }),
    browserAction.setTitle({ tabId, title: summary ? `Host overrides active\n${summary}` : null }),
  ]);
}

async function readGlobalFromStorage(): Promise<unknown> {
  return (await browser.storage.local.get(GLOBAL_STORAGE_KEY))[GLOBAL_STORAGE_KEY];
}

async function writeGlobalToStorage(groups: HostOverrideGroup[]): Promise<void> {
  await browser.storage.local.set({ [GLOBAL_STORAGE_KEY]: groups });
}

/**
 * Host overrides: groups of hostnames whose traffic goes to a fixed IP instead
 * of where DNS points. A group either belongs to one tab, kept in that tab's
 * session data so it follows the tab across restarts and vanishes when it
 * closes, or is global, kept in extension storage and used by every tab. When
 * both route a hostname, the tab's own group wins.
 *
 * Routing works through `proxy.onRequest`: a matching request is handed to the
 * loopback proxy for its group's IP (see `public/experiment/zenHosts`).
 */
export function createHostOverrideService({
  ports = createHostProxyPorts(),
  notify = showNotification,
  setIndicator = setToolbarIndicator,
  readGlobal = readGlobalFromStorage,
  writeGlobal = writeGlobalToStorage,
}: HostOverrideServiceDeps = {}) {
  const values = createTabSessionValues<HostOverrideGroup[]>(
    "tabHostOverrides",
    hostOverrideListSchema,
  );
  /** A synchronous copy of every loaded tab's groups, read on every request. */
  const groupsByTab = new Map<number, HostOverrideGroup[]>();
  /** Each tab's session read, kept so a burst of first requests reads it once. */
  const loading = new Map<number, Promise<void>>();
  let globalGroups: HostOverrideGroup[] = [];
  let globalLoaded = false;
  /** Every IP an enabled group routes to; empty means no request needs looking at. */
  let enabledIps = new Set<string>();
  /** `tabId:groupId` or `global:groupId` keys whose notice was shown since the group last changed. */
  const announced = new Set<string>();
  /** Requests sent to each IP's proxy, for the editor's status line. */
  const routedByIp = new Map<string, number>();

  const globalReady = readGlobal()
    .then((saved) => {
      const parsed = v.safeParse(hostOverrideListSchema, saved);
      if (parsed.success) {
        globalGroups = parsed.output;
      }
    })
    .catch((error) => {
      console.error(`${LOG_PREFIX} Could not read global host overrides:`, formatError(error));
    })
    .finally(() => {
      globalLoaded = true;
      enabledIps = collectEnabledIps();
      void refreshGlobalIndicator();
    });

  function collectEnabledIps(): Set<string> {
    const ips = new Set<string>();
    for (const groups of [...groupsByTab.values(), globalGroups]) {
      for (const group of groups) {
        if (group.enabled) {
          ips.add(group.ip);
        }
      }
    }
    return ips;
  }

  /** Recomputes which IPs are in use and stops the proxies no enabled group needs any more. */
  async function groupsChanged(): Promise<void> {
    enabledIps = collectEnabledIps();
    try {
      await ports.release(enabledIps);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not stop an unused host proxy:`, formatError(error));
    }
  }

  function load(tabIds: number[]): Promise<void> {
    return Promise.all(
      tabIds.filter(isUsableTabId).map((tabId) => {
        let pending = loading.get(tabId);
        if (!pending) {
          pending = values.get([tabId]).then(([entry]) => {
            if (entry) {
              groupsByTab.set(tabId, entry.value);
              enabledIps = collectEnabledIps();
              void refreshIndicator(tabId);
            }
          });
          loading.set(tabId, pending);
        }
        return pending;
      }),
    ).then(() => undefined);
  }

  function globalSummary(): string {
    return formatHostOverrideSummary(globalGroups)
      .split("\n")
      .filter(Boolean)
      .map((line) => `All tabs · ${line}`)
      .join("\n");
  }

  async function applyIndicator(tabId: number | undefined, summary: string): Promise<void> {
    try {
      await setIndicator(tabId, summary);
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not update the host override indicator:`, formatError(error));
    }
  }

  /** A tab with its own routes lists them above the global ones; other tabs show the default. */
  async function refreshIndicator(tabId: number): Promise<void> {
    const own = formatHostOverrideSummary(groupsByTab.get(tabId) ?? []);
    await applyIndicator(tabId, own ? [own, globalSummary()].filter(Boolean).join("\n") : "");
  }

  async function refreshGlobalIndicator(): Promise<void> {
    await Promise.all([
      applyIndicator(undefined, globalSummary()),
      ...[...groupsByTab.keys()].map((tabId) => refreshIndicator(tabId)),
    ]);
  }

  function announce(tabId: number, group: HostOverrideGroup, scope: HostOverrideScope): void {
    const key = scope === "global" ? `global:${group.id}` : `${tabId}:${group.id}`;
    if (announced.has(key)) {
      return;
    }
    announced.add(key);
    const { title, message } = formatHostOverrideNotice(group, scope);
    // The ID names the tab that triggered it, so clicking the notice opens that tab.
    const id = `${NOTIFICATION_PREFIX}${isUsableTabId(tabId) ? tabId : "none"}:${group.id}`;
    void notify(id, title, message).catch((error) => {
      debugWarn(`${LOG_PREFIX} Could not show the host override notice:`, formatError(error));
    });
  }

  function route(tabId: number, url: string): ProxyResult | Promise<ProxyResult> {
    if (enabledIps.size === 0) {
      return undefined;
    }
    const own = isUsableTabId(tabId) ? groupsByTab.get(tabId) : undefined;
    const hostname = hostnameOf(url);
    const ownGroup = own ? findHostOverride(own, hostname) : undefined;
    const group = ownGroup ?? findHostOverride(globalGroups, hostname);
    if (!group) {
      return undefined;
    }

    const scope = ownGroup ? "tab" : "global";
    announce(tabId, group, scope);
    routedByIp.set(group.ip, (routedByIp.get(group.ip) ?? 0) + 1);
    debugLog(`${LOG_PREFIX} Routing tab ${tabId} ${url} to ${group.ip} (${scope} group)`);
    const port = ports.peek(group.ip);
    if (port !== undefined) {
      return loopbackProxy(port);
    }
    return ports.ensure(group.ip).then(loopbackProxy, (error: unknown) => {
      console.error(
        `${LOG_PREFIX} Could not start the host proxy for ${group.ip}:`,
        formatError(error),
      );
      return DEAD_PROXY;
    });
  }

  /**
   * The `proxy.onRequest` listener. Synchronous once the global routes and the
   * tab's own are loaded. Requests without a tab only use global routes.
   */
  function resolveProxy(details: ProxyRequestDetails): ProxyResult | Promise<ProxyResult> {
    const { tabId, url } = details;
    if (!globalLoaded) {
      return globalReady.then(() => resolveProxy(details));
    }
    if (isUsableTabId(tabId) && !loading.has(tabId)) {
      return load([tabId]).then(
        () => route(tabId, url),
        () => route(-1, url),
      );
    }
    return route(tabId, url);
  }

  async function getOverrides(tabId: number): Promise<HostOverrideGroup[]> {
    await load([tabId]);
    return groupsByTab.get(tabId) ?? [];
  }

  async function getGlobalOverrides(): Promise<HostOverrideGroup[]> {
    await globalReady;
    return globalGroups;
  }

  function validated(groups: unknown): HostOverrideGroup[] {
    const result = validateHostOverrides(groups);
    if ("error" in result) {
      throw new Error(result.error);
    }
    return result.groups;
  }

  /** A group that changed in any way announces itself again the next time it routes. */
  function forgetChangedAnnouncements(
    keyPrefix: string,
    previous: HostOverrideGroup[],
    next: HostOverrideGroup[],
  ): void {
    for (const group of previous) {
      const updated = next.find((candidate) => candidate.id === group.id);
      if (!updated || JSON.stringify(updated) !== JSON.stringify(group)) {
        announced.delete(`${keyPrefix}${group.id}`);
      }
    }
  }

  /** Replaces a tab's groups. Throws with a message for the user when the list is invalid. */
  async function setOverrides(tabId: number, groups: unknown): Promise<HostOverrideGroup[]> {
    if (!isUsableTabId(tabId)) {
      throw new Error("Invalid tab ID.");
    }
    const next = validated(groups);
    await load([tabId]);
    forgetChangedAnnouncements(`${tabId}:`, groupsByTab.get(tabId) ?? [], next);

    if (next.length === 0) {
      groupsByTab.delete(tabId);
    } else {
      groupsByTab.set(tabId, next);
    }
    await Promise.all([
      values.set(tabId, next.length === 0 ? undefined : next),
      refreshIndicator(tabId),
      groupsChanged(),
    ]);
    return next;
  }

  /** Replaces the groups every tab uses. Throws with a message for the user when invalid. */
  async function setGlobalOverrides(groups: unknown): Promise<HostOverrideGroup[]> {
    const next = validated(groups);
    await globalReady;
    forgetChangedAnnouncements("global:", globalGroups, next);
    globalGroups = next;
    await Promise.all([writeGlobal(next), refreshGlobalIndicator(), groupsChanged()]);
    return next;
  }

  /** Turns one group on or off. */
  async function setEnabled(
    scope: HostOverrideScope,
    tabId: number,
    groupId: string,
    enabled: boolean,
  ): Promise<void> {
    if (scope === "global") {
      await setGlobalOverrides(setGroupEnabled(await getGlobalOverrides(), enabled, groupId));
    } else {
      await setOverrides(tabId, setGroupEnabled(await getOverrides(tabId), enabled, groupId));
    }
  }

  /** Turns off everything that routes this tab: its own groups and the global ones. */
  async function disableAll(tabId: number): Promise<void> {
    const [own, global] = await Promise.all([getOverrides(tabId), getGlobalOverrides()]);
    await Promise.all([
      setOverrides(tabId, setGroupEnabled(own, false)),
      global.some((group) => group.enabled)
        ? setGlobalOverrides(setGroupEnabled(global, false))
        : undefined,
    ]);
  }

  /** Puts the toolbar marker back on a tab with routes, after a navigation reset it. */
  function reapplyIndicator(tabId: number): void {
    if (groupsByTab.has(tabId)) {
      void refreshIndicator(tabId);
    }
  }

  /** One entry per IP an enabled group routes to or whose proxy still runs, plus the log path. */
  async function getStatus(): Promise<HostProxyReport> {
    await globalReady;
    const { logPath, running, startErrors } = await ports.status();
    const ips = new Set([...enabledIps, ...running.map((proxy) => proxy.ip)]);
    return {
      logPath,
      proxies: [...ips].map((ip) => {
        const proxy = running.find((candidate) => candidate.ip === ip);
        return {
          ip,
          port: proxy?.port ?? ports.peek(ip),
          routed: routedByIp.get(ip) ?? 0,
          connected: proxy?.connected ?? 0,
          open: proxy?.open ?? 0,
          lastError: startErrors.get(ip) || proxy?.lastError || "",
        };
      }),
    };
  }

  /** Drops a closed tab's routes and stops the proxies nothing else uses. */
  function forget(tabId: number): void {
    values.forget(tabId);
    loading.delete(tabId);
    const hadGroups = groupsByTab.delete(tabId);
    for (const key of [...announced]) {
      if (key.startsWith(`${tabId}:`)) {
        announced.delete(key);
      }
    }
    if (hadGroups) {
      void groupsChanged();
    }
  }

  return {
    load,
    resolveProxy,
    getOverrides,
    getGlobalOverrides,
    setOverrides,
    setGlobalOverrides,
    setEnabled,
    disableAll,
    reapplyIndicator,
    getStatus,
    forget,
  };
}

export type HostOverrideService = ReturnType<typeof createHostOverrideService>;

/**
 * Hooks the service into the browser: every request is offered to it for
 * routing, and the per-tab toolbar marker is put back after a navigation,
 * which resets tab-specific button state.
 */
export function registerHostOverrides(service: HostOverrideService): void {
  const proxy = (
    browser as typeof browser & {
      proxy?: {
        onRequest?: {
          addListener(
            listener: (details: ProxyRequestDetails) => ProxyResult | Promise<ProxyResult>,
            filter: { urls: string[] },
          ): void;
        };
        onError?: { addListener(listener: (error: unknown) => void): void };
      };
    }
  ).proxy;
  if (!proxy?.onRequest) {
    console.error(`${LOG_PREFIX} proxy.onRequest is unavailable; host overrides are off.`);
    return;
  }
  proxy.onRequest.addListener(service.resolveProxy, { urls: ["<all_urls>"] });
  proxy.onError?.addListener((error) => {
    console.error(`${LOG_PREFIX} Host override proxy error:`, formatError(error));
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading" || changeInfo.url) {
      service.reapplyIndicator(tabId);
    }
  });
}
