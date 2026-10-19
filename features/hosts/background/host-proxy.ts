import { errorMessage } from "@/shared/log";

/** What the `zenHosts` experiment reports about one running proxy. */
export interface ExperimentProxyStatus {
  ip: string;
  port: number;
  connected: number;
  open: number;
  lastError: string;
}

/** The `zenHosts` experiment: loopback proxies that send everything to one IP. */
interface ZenHostsApi {
  startHostProxy(ip: string): Promise<number>;
  stopHostProxy(ip: string): Promise<boolean>;
  getHostProxyStatus(): Promise<{ logPath: string; proxies: ExperimentProxyStatus[] }>;
}

export interface HostProxyPorts {
  /** The loopback port that tunnels to `ip`, starting its proxy on first use. */
  ensure(ip: string): Promise<number>;
  /** The port when the proxy for `ip` is already running. */
  peek(ip: string): number | undefined;
  /** Stops every proxy whose IP is not in `keep`. */
  release(keep: ReadonlySet<string>): Promise<void>;
  /**
   * Forgets every cached port without stopping anything, so the next request
   * asks the experiment again; it restarts a proxy whose listener died.
   */
  forgetPorts(): void;
  /**
   * The running proxies, the error of each IP whose proxy could not start, and
   * the log file the proxies write failures to ("" without the experiment).
   */
  status(): Promise<{
    logPath: string;
    running: ExperimentProxyStatus[];
    startErrors: Map<string, string>;
  }>;
}

function getZenHostsApi(): ZenHostsApi | undefined {
  return (browser as typeof browser & { zenHosts?: ZenHostsApi }).zenHosts;
}

export function createHostProxyPorts(api = getZenHostsApi): HostProxyPorts {
  const ports = new Map<string, number>();
  const pending = new Map<string, Promise<number>>();
  const startErrors = new Map<string, string>();

  function ensure(ip: string): Promise<number> {
    const port = ports.get(ip);
    if (port !== undefined) {
      return Promise.resolve(port);
    }
    const existing = pending.get(ip);
    if (existing) {
      return existing;
    }

    const zenHosts = api();
    if (!zenHosts) {
      const message = "Zen's privileged zenHosts experiment API is unavailable.";
      startErrors.set(ip, message);
      return Promise.reject(new Error(message));
    }
    const started = zenHosts
      .startHostProxy(ip)
      .then(
        (nextPort) => {
          ports.set(ip, nextPort);
          startErrors.delete(ip);
          return nextPort;
        },
        (error: unknown) => {
          startErrors.set(ip, errorMessage(error));
          throw error;
        },
      )
      .finally(() => pending.delete(ip));
    pending.set(ip, started);
    return started;
  }

  async function release(keep: ReadonlySet<string>): Promise<void> {
    const stale = [...ports.keys()].filter((ip) => !keep.has(ip));
    for (const ip of stale) {
      ports.delete(ip);
    }
    for (const ip of [...startErrors.keys()]) {
      if (!keep.has(ip)) {
        startErrors.delete(ip);
      }
    }
    await Promise.all(stale.map((ip) => api()?.stopHostProxy(ip)));
  }

  async function status() {
    const reported = await api()?.getHostProxyStatus();
    return {
      logPath: reported?.logPath ?? "",
      running: reported?.proxies ?? [],
      startErrors: new Map(startErrors),
    };
  }

  return { ensure, peek: (ip) => ports.get(ip), release, status, forgetPorts: () => ports.clear() };
}
