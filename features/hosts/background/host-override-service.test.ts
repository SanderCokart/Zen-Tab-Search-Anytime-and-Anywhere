import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHostOverrideService,
  parseHostOverrideNotificationTabId,
} from "@/features/hosts/background/host-override-service";
import type { HostProxyPorts } from "@/features/hosts/background/host-proxy";
import type { HostOverrideGroup } from "@/shared/types";

/** A stand-in for `browser.sessions`, holding whatever the service saves per tab. */
function stubSessions(initial: Record<number, unknown> = {}) {
  const values = new Map<number, unknown>(
    Object.entries(initial).map(([id, value]) => [Number(id), value]),
  );
  Object.assign(globalThis, {
    browser: {
      sessions: {
        getTabValue: vi.fn(async (tabId: number) => values.get(tabId)),
        setTabValue: vi.fn(async (tabId: number, _key: string, value: unknown) => {
          values.set(tabId, value);
        }),
        removeTabValue: vi.fn(async (tabId: number) => {
          values.delete(tabId);
        }),
      },
    },
  });
  return values;
}

function fakePorts(): HostProxyPorts & { running: Map<string, number> } {
  const running = new Map<string, number>();
  let nextPort = 40_000;
  return {
    running,
    ensure: vi.fn(async (ip: string) => {
      if (!running.has(ip)) {
        running.set(ip, nextPort++);
      }
      return running.get(ip)!;
    }),
    peek: (ip) => running.get(ip),
    release: vi.fn(async (keep: ReadonlySet<string>) => {
      for (const ip of [...running.keys()]) {
        if (!keep.has(ip)) {
          running.delete(ip);
        }
      }
    }),
    forgetPorts: vi.fn(() => running.clear()),
    status: async () => ({
      logPath: "C:\\Temp\\zen-tab-search-hosts.log",
      running: [...running].map(([ip, port]) => ({
        ip,
        port,
        connected: 1,
        open: 1,
        lastError: "",
      })),
      startErrors: new Map([["10.0.0.9", "no experiment"]]),
    }),
  };
}

const staging: HostOverrideGroup = {
  id: "staging",
  ip: "10.0.0.1",
  description: "Staging",
  hostnames: ["example.com", "*.example.com"],
  enabled: true,
};

function setup(savedGlobal: unknown = undefined) {
  const ports = fakePorts();
  const notify = vi.fn(async () => undefined);
  const setIndicator = vi.fn(async () => undefined);
  const writeGlobal = vi.fn(async () => undefined);
  const service = createHostOverrideService({
    ports,
    notify,
    setIndicator,
    readGlobal: async () => savedGlobal,
    writeGlobal,
  });
  return { service, ports, notify, setIndicator, writeGlobal };
}

describe("host override service", () => {
  beforeEach(() => {
    stubSessions();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "browser");
  });

  it("routes only matching hostnames in the tab that has the override", async () => {
    const { service, ports } = setup();
    await service.setOverrides(1, [staging]);
    await service.load([2]);

    await expect(
      service.resolveProxy({ tabId: 1, url: "https://api.example.com/v1" }),
    ).resolves.toEqual({ type: "http", host: "127.0.0.1", port: 40_000 });
    // Once the proxy runs, routing is synchronous.
    expect(service.resolveProxy({ tabId: 1, url: "https://example.com/" })).toEqual({
      type: "http",
      host: "127.0.0.1",
      port: 40_000,
    });
    expect(service.resolveProxy({ tabId: 1, url: "https://other.test/" })).toBeUndefined();
    expect(service.resolveProxy({ tabId: 2, url: "https://example.com/" })).toBeUndefined();
    expect(service.resolveProxy({ tabId: -1, url: "https://example.com/" })).toBeUndefined();
    expect(ports.ensure).toHaveBeenCalledTimes(1);
  });

  it("reads a new tab's session once for a burst of its first requests", async () => {
    stubSessions({ 5: [staging] });
    const { service } = setup();

    await Promise.all(
      ["/", "/a.js", "/b.css"].map((path) =>
        service.resolveProxy({ tabId: 5, url: `https://example.com${path}` }),
      ),
    );
    const sessions = (browser as unknown as { sessions: { getTabValue: () => unknown } }).sessions;
    expect(sessions.getTabValue).toHaveBeenCalledTimes(1);
  });

  it("does not route a group that is off", async () => {
    const { service } = setup();
    await service.setOverrides(1, [{ ...staging, enabled: false }]);
    expect(service.resolveProxy({ tabId: 1, url: "https://example.com/" })).toBeUndefined();
  });

  it("loads a restored tab's overrides from its session on its first request", async () => {
    stubSessions({ 7: [staging] });
    const { service } = setup();

    await expect(service.resolveProxy({ tabId: 7, url: "https://example.com/" })).resolves.toEqual(
      expect.objectContaining({ host: "127.0.0.1" }),
    );
  });

  it("saves overrides in the tab session and removes them when the list is empty", async () => {
    const values = stubSessions();
    const { service } = setup();

    await service.setOverrides(1, [staging]);
    expect(values.get(1)).toEqual([staging]);

    await service.setOverrides(1, []);
    expect(values.has(1)).toBe(false);
  });

  it("rejects an invalid list with a message for the user", async () => {
    const { service } = setup();
    await expect(
      service.setOverrides(1, [staging, { ...staging, id: "dup", hostnames: ["x.test"] }]),
    ).rejects.toThrow(/already a group/);
  });

  it("announces a group once, and again after it changes", async () => {
    const { service, notify } = setup();
    await service.setOverrides(1, [staging]);

    await service.resolveProxy({ tabId: 1, url: "https://example.com/" });
    await service.resolveProxy({ tabId: 1, url: "https://example.com/app.js" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      "host-override:1:staging",
      "Routing via Staging",
      "example.com, *.example.com → 10.0.0.1 in this tab.",
    );

    await service.setEnabled("tab", 1, "staging", false);
    await service.setEnabled("tab", 1, "staging", true);
    await service.resolveProxy({ tabId: 1, url: "https://example.com/" });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("marks the toolbar button while a group is on", async () => {
    const { service, setIndicator } = setup();
    await service.setOverrides(1, [staging]);
    expect(setIndicator).toHaveBeenLastCalledWith(
      1,
      "Staging (10.0.0.1): example.com, *.example.com",
    );

    await service.disableAll(1);
    expect(setIndicator).toHaveBeenLastCalledWith(1, "");
  });

  it("stops a proxy once no enabled group uses its IP", async () => {
    const { service, ports } = setup();
    await service.setOverrides(1, [staging]);
    await service.setOverrides(2, [{ ...staging, id: "copy" }]);
    await service.resolveProxy({ tabId: 1, url: "https://example.com/" });
    expect(ports.running.has("10.0.0.1")).toBe(true);

    await service.setEnabled("tab", 1, "staging", false);
    expect(ports.running.has("10.0.0.1")).toBe(true);

    service.forget(2);
    await vi.waitFor(() => expect(ports.running.has("10.0.0.1")).toBe(false));
  });

  it("fails closed when the proxy cannot start", async () => {
    const { service, ports } = setup();
    vi.mocked(ports.ensure).mockRejectedValueOnce(new Error("no experiment"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await service.setOverrides(1, [staging]);

    await expect(service.resolveProxy({ tabId: 1, url: "https://example.com/" })).resolves.toEqual({
      type: "http",
      host: "127.0.0.1",
      port: 9,
    });
  });

  it("reads the tab from its notification ID", () => {
    expect(parseHostOverrideNotificationTabId("host-override:12:staging")).toBe(12);
    expect(parseHostOverrideNotificationTabId("tab-timer-12")).toBeUndefined();
  });

  it("routes global groups in every tab and for requests without a tab", async () => {
    const { service, writeGlobal } = setup();
    await service.setGlobalOverrides([staging]);
    expect(writeGlobal).toHaveBeenCalledWith([staging]);

    for (const tabId of [1, 2, -1]) {
      await expect(
        Promise.resolve(service.resolveProxy({ tabId, url: "https://example.com/" })),
      ).resolves.toEqual(expect.objectContaining({ host: "127.0.0.1" }));
    }
  });

  it("loads saved global groups before routing the first request", async () => {
    const { service } = setup([staging]);
    await expect(
      Promise.resolve(service.resolveProxy({ tabId: 3, url: "https://example.com/" })),
    ).resolves.toEqual(expect.objectContaining({ host: "127.0.0.1" }));
  });

  it("lets a tab's own group win over a global one for the same hostname", async () => {
    const { service, ports } = setup();
    await service.setGlobalOverrides([staging]);
    await service.setOverrides(1, [{ ...staging, id: "local", ip: "127.0.0.2" }]);

    await service.resolveProxy({ tabId: 1, url: "https://example.com/" });
    await service.resolveProxy({ tabId: 2, url: "https://example.com/" });
    expect(ports.ensure).toHaveBeenCalledWith("127.0.0.2");
    expect(ports.ensure).toHaveBeenCalledWith("10.0.0.1");
  });

  it("announces a global group once for all tabs", async () => {
    const { service, notify } = setup();
    await service.setGlobalOverrides([staging]);
    await service.resolveProxy({ tabId: 1, url: "https://example.com/" });
    await service.resolveProxy({ tabId: 2, url: "https://example.com/" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      "host-override:1:staging",
      "Routing via Staging",
      "example.com, *.example.com → 10.0.0.1 in all tabs.",
    );
  });

  it("marks the button's default while a global group is on", async () => {
    const { service, setIndicator } = setup();
    await service.setGlobalOverrides([staging]);
    expect(setIndicator).toHaveBeenCalledWith(
      undefined,
      "All tabs · Staging (10.0.0.1): example.com, *.example.com",
    );
  });

  it("turns off a tab's own and the global groups together", async () => {
    const { service } = setup();
    await service.setGlobalOverrides([staging]);
    await service.setOverrides(1, [{ ...staging, id: "local", ip: "127.0.0.2" }]);

    await service.disableAll(1);
    expect((await service.getOverrides(1))[0]?.enabled).toBe(false);
    expect((await service.getGlobalOverrides())[0]?.enabled).toBe(false);
  });

  it("reports each routed IP with its proxy counters", async () => {
    const { service } = setup();
    await service.setOverrides(1, [staging]);
    await service.setOverrides(2, [{ ...staging, id: "down", ip: "10.0.0.9" }]);
    await service.resolveProxy({ tabId: 1, url: "https://example.com/" });

    await expect(service.getStatus()).resolves.toEqual({
      logPath: "C:\\Temp\\zen-tab-search-hosts.log",
      proxies: [
        { ip: "10.0.0.1", port: 40_000, routed: 1, connected: 1, open: 1, lastError: "" },
        {
          ip: "10.0.0.9",
          port: undefined,
          routed: 0,
          connected: 0,
          open: 0,
          lastError: "no experiment",
        },
      ],
    });
  });

  it("looks the port up again after Firefox reports a proxy error", async () => {
    const { service, ports } = setup();
    await service.setOverrides(1, [staging]);
    await service.resolveProxy({ tabId: 1, url: "https://example.com/" });
    expect(ports.ensure).toHaveBeenCalledTimes(1);

    service.proxyFailed();
    await expect(
      Promise.resolve(service.resolveProxy({ tabId: 1, url: "https://example.com/" })),
    ).resolves.toEqual(expect.objectContaining({ host: "127.0.0.1" }));
    expect(ports.ensure).toHaveBeenCalledTimes(2);
  });
});
