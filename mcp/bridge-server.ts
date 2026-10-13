import { randomUUID, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  BRIDGE_PORT,
  BRIDGE_PROTOCOL_VERSION,
  parseBridgeHello,
  type BridgeCommand,
  type BridgeResponse,
} from "@/shared/messaging/bridge-protocol";

const AUTH_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 1_500;
/** Retry delays while the port cannot be bound, by cause. */
const DEFAULT_RETRY_MS = { held: 5_000, transient: 1_000, other: 5_000 };

const ENABLE_HINT =
  'Check that Zen is open, that the installed Zen Tab Search build includes the MCP bridge, and that "AI agents (MCP)" is turned on in its settings.';

export interface BridgeHolder {
  pid: number;
  version: string;
  startedAt: string;
  zenConnected: boolean;
}

export type PortProbe =
  | { kind: "zen-server"; holder: BridgeHolder }
  | { kind: "free" }
  | { kind: "other-program" };

type ListenState =
  | { kind: "starting" }
  | { kind: "listening" }
  | { kind: "held"; holder: BridgeHolder }
  | { kind: "transient" }
  | { kind: "other-program" }
  | { kind: "failed"; message: string }
  | { kind: "closed" };

export interface ZenBridgeOptions {
  token: string;
  port?: number;
  version?: string;
  requestTimeoutMs?: number;
  retryMs?: Partial<typeof DEFAULT_RETRY_MS>;
  log?: (message: string) => void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

function tokensMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Asks whatever holds `port` who it is. Another zen-tab-search server answers
 * the probe; a refused connection means nothing is listening (the bind failure
 * was transient, such as a closing socket in TIME_WAIT); anything else is some
 * other program.
 */
export function probePort(port: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<PortProbe> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    let settled = false;
    const finish = (result: PortProbe) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      // terminate() on a connecting socket emits an error nobody else listens for.
      socket.on("error", () => {});
      socket.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ kind: "other-program" }), timeoutMs);

    socket.on("open", () => socket.send(JSON.stringify({ type: "probe" })));
    socket.on("message", (data) => {
      try {
        const reply = JSON.parse(data.toString()) as { type?: unknown } & Partial<BridgeHolder>;
        if (reply.type === "probe-reply" && typeof reply.pid === "number") {
          finish({
            kind: "zen-server",
            holder: {
              pid: reply.pid,
              version: String(reply.version ?? "unknown"),
              startedAt: String(reply.startedAt ?? "unknown"),
              zenConnected: reply.zenConnected === true,
            },
          });
          return;
        }
      } catch {
        // Not ours.
      }
      finish({ kind: "other-program" });
    });
    socket.on("unexpected-response", () => finish({ kind: "other-program" }));
    socket.on("error", (error: NodeJS.ErrnoException) =>
      finish(error.code === "ECONNREFUSED" ? { kind: "free" } : { kind: "other-program" }),
    );
  });
}

/**
 * Loopback WebSocket server that the Zen extension dials into.
 *
 * Only one process can own the port. When another zen-tab-search server
 * already holds it (typically started by a second MCP client), this one keeps
 * running, reports who holds the port, and takes over as soon as it is free.
 * Only one Zen connection is active at a time: a newer authenticated
 * connection (for example after Zen restarts) replaces the older one.
 */
export class ZenBridge {
  readonly #requestedPort: number;
  readonly #token: string;
  readonly #version: string;
  readonly #requestTimeoutMs: number;
  readonly #retryMs: typeof DEFAULT_RETRY_MS;
  readonly #log: (message: string) => void;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #startedAt = new Date();
  #server?: WebSocketServer;
  #client?: WebSocket;
  #state: ListenState = { kind: "starting" };
  #retryTimer?: ReturnType<typeof setTimeout>;
  #lastConnectedAt?: Date;
  #lastDisconnectedAt?: Date;
  #lastRejection?: { at: Date; message: string };

  constructor(options: ZenBridgeOptions) {
    this.#token = options.token;
    this.#requestedPort = options.port ?? BRIDGE_PORT;
    this.#version = options.version ?? "dev";
    this.#requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.#retryMs = { ...DEFAULT_RETRY_MS, ...options.retryMs };
    this.#log = options.log ?? (() => {});
  }

  /** The bound port once listening (port 0 picks a free one), else the requested port. */
  get port(): number {
    const address = this.#server?.address();
    return typeof address === "object" && address
      ? (address as AddressInfo).port
      : this.#requestedPort;
  }

  get connected(): boolean {
    return this.#client !== undefined;
  }

  get listening(): boolean {
    return this.#state.kind === "listening";
  }

  /** Why requests cannot reach Zen right now, as advice the user can act on; undefined when they can. */
  get unavailableReason(): string | undefined {
    const port = this.#requestedPort;
    switch (this.#state.kind) {
      case "starting":
        return "The MCP server is still starting. Try again in a moment.";
      case "closed":
        return "The MCP server is shutting down.";
      case "failed":
        return `Could not listen on port ${port}: ${this.#state.message}`;
      case "transient":
        return `Port ${port} was briefly unavailable, but nothing is listening on it (for example a closed connection still in TIME_WAIT). Retrying every second; try again in a moment.`;
      case "other-program":
        return `Port ${port} is in use by a program that is not a zen-tab-search MCP server. The Zen extension always connects to port ${port}, so that program has to stop first. Retrying every few seconds.`;
      case "held": {
        const { holder } = this.#state;
        return `Port ${port} is held by another zen-tab-search MCP server (process ${holder.pid}, version ${holder.version}, started ${holder.startedAt}, Zen ${holder.zenConnected ? "connected to it" : "not connected"}). It was most likely started by another MCP client such as Claude or Cursor, and only one server can talk to Zen. Quit that client or remove zen-tab-search from its MCP config, or end process ${holder.pid}. This server takes over automatically once the port is free.`;
      }
      case "listening":
        break;
    }

    if (this.#client) {
      return undefined;
    }
    if (this.#lastRejection) {
      return this.#lastRejection.message;
    }
    if (this.#lastDisconnectedAt) {
      return `Zen disconnected at ${this.#lastDisconnectedAt.toISOString()}. If Zen is still open it reconnects within a minute. ${ENABLE_HINT}`;
    }
    return `Zen has not connected since this server started at ${this.#startedAt.toISOString()}. ${ENABLE_HINT} The extension retries every few seconds, slowing to once a minute while no server is running.`;
  }

  /** Everything `zen_status` reports. */
  status() {
    const problem = this.unavailableReason;
    return {
      connected: this.connected,
      bridge: this.#state.kind,
      port: this.port,
      pid: process.pid,
      version: this.#version,
      startedAt: this.#startedAt.toISOString(),
      ...(this.#lastConnectedAt
        ? { lastZenConnectionAt: this.#lastConnectedAt.toISOString() }
        : {}),
      ...(this.#state.kind === "held" ? { portHolder: this.#state.holder } : {}),
      ...(problem ? { problem } : {}),
    };
  }

  /** Tries to take the port once; keeps retrying in the background when it is not free. */
  async start(): Promise<void> {
    await this.#tryListen();
  }

  request(command: BridgeCommand): Promise<unknown> {
    const client = this.#client;
    const reason = this.unavailableReason;
    if (!client || reason) {
      return Promise.reject(new Error(reason ?? "Zen is not connected."));
    }

    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new Error(
            `Zen did not answer ${command.type} within ${Math.round(this.#requestTimeoutMs / 1000)} seconds. Zen may be busy or showing a dialog; try again.`,
          ),
        );
      }, this.#requestTimeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      client.send(JSON.stringify({ id, command }));
    });
  }

  close(): void {
    this.#state = { kind: "closed" };
    clearTimeout(this.#retryTimer);
    this.#dropClient(new Error("The MCP server is shutting down."));
    this.#server?.close();
    this.#server = undefined;
  }

  async #tryListen(): Promise<void> {
    if (this.#state.kind === "closed") {
      return;
    }
    const error = await this.#listen();
    if (!error) {
      if (this.#state.kind !== "starting") {
        this.#log(`took over port ${this.port}`);
      }
      this.#state = { kind: "listening" };
      this.#log(`listening for Zen on ws://127.0.0.1:${this.port}`);
      return;
    }

    if (error.code === "EADDRINUSE") {
      const probe = await probePort(this.#requestedPort);
      this.#state =
        probe.kind === "zen-server"
          ? { kind: "held", holder: probe.holder }
          : probe.kind === "free"
            ? { kind: "transient" }
            : { kind: "other-program" };
    } else {
      this.#state = { kind: "failed", message: error.message };
    }
    this.#log(this.unavailableReason ?? "");

    const delay =
      this.#state.kind === "held"
        ? this.#retryMs.held
        : this.#state.kind === "transient"
          ? this.#retryMs.transient
          : this.#retryMs.other;
    this.#retryTimer = setTimeout(() => void this.#tryListen(), delay);
  }

  #listen(): Promise<NodeJS.ErrnoException | undefined> {
    return new Promise((resolve) => {
      const server = new WebSocketServer({
        host: "127.0.0.1",
        port: this.#requestedPort,
        // Only the extension (moz-extension://) or a non-browser client may connect.
        // A web page's origin is refused outright, even if it guesses the token.
        verifyClient: ({ origin }: { origin?: string }) =>
          !origin || origin.startsWith("moz-extension://"),
      });

      server.once("error", (error: NodeJS.ErrnoException) => {
        server.close();
        resolve(error);
      });
      server.once("listening", () => {
        server.removeAllListeners("error");
        server.on("error", (error) => this.#log(`bridge socket error: ${error.message}`));
        server.on("connection", (socket) => this.#accept(socket));
        this.#server = server;
        resolve(undefined);
      });
    });
  }

  #accept(socket: WebSocket): void {
    let authenticated = false;
    const authTimer = setTimeout(() => socket.close(), AUTH_TIMEOUT_MS);

    socket.on("message", (raw) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!authenticated) {
        clearTimeout(authTimer);
        if ((message as { type?: unknown } | null)?.type === "probe") {
          // Lets a second server explain who holds the port. Web pages cannot
          // reach this: their origin is refused before any message arrives.
          socket.send(
            JSON.stringify({
              type: "probe-reply",
              pid: process.pid,
              version: this.#version,
              startedAt: this.#startedAt.toISOString(),
              zenConnected: this.connected,
            }),
          );
          socket.close();
          return;
        }

        const mismatch = this.#protocolMismatch(message);
        if (mismatch) {
          this.#reject(socket, mismatch, "protocol");
          return;
        }

        const hello = parseBridgeHello(message);
        if (!hello || !tokensMatch(this.#token, hello.token)) {
          this.#reject(
            socket,
            `Zen tried to connect at ${new Date().toISOString()}, but its token does not match ZEN_BRIDGE_TOKEN. Copy the token again from "AI agents (MCP)" in Zen Tab Search's settings, update ZEN_BRIDGE_TOKEN in your MCP client's config, and restart the client.`,
          );
          return;
        }

        authenticated = true;
        this.#lastRejection = undefined;
        this.#lastConnectedAt = new Date();
        this.#dropClient(new Error("Replaced by a newer Zen connection."));
        this.#client = socket;
        socket.send(JSON.stringify({ type: "welcome" }));
        this.#log("Zen connected");
        return;
      }

      this.#settle(message as BridgeResponse);
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      if (this.#client === socket) {
        this.#lastDisconnectedAt = new Date();
        this.#dropClient(new Error("Zen disconnected before answering. Try again."));
        this.#log("Zen disconnected");
      }
    });
  }

  #reject(socket: WebSocket, message: string, reason?: "protocol"): void {
    this.#lastRejection = { at: new Date(), message };
    this.#log(message);
    socket.send(JSON.stringify(reason ? { type: "rejected", reason } : { type: "rejected" }));
    socket.close();
  }

  /**
   * The extension and this server are separate downloads, so they can drift
   * apart. Only a peer with the right token learns about it, so a stranger
   * cannot plant a misleading status.
   */
  #protocolMismatch(message: unknown): string | undefined {
    const hello = message as { type?: unknown; token?: unknown; protocolVersion?: unknown } | null;
    if (
      hello?.type !== "hello" ||
      hello.protocolVersion === BRIDGE_PROTOCOL_VERSION ||
      typeof hello.token !== "string" ||
      !tokensMatch(this.#token, hello.token)
    ) {
      return undefined;
    }
    return `Version mismatch: the Zen Tab Search extension uses bridge protocol ${String(hello.protocolVersion)} but this MCP server (version ${this.#version}) uses ${BRIDGE_PROTOCOL_VERSION}. Install the extension and zen-tab-search-mcp.mjs from the same release, then restart Zen and your MCP client.`;
  }

  #settle(response: BridgeResponse): void {
    if (typeof response !== "object" || response === null || typeof response.id !== "string") {
      return;
    }
    const pending = this.#pending.get(response.id);
    if (!pending) {
      return;
    }
    this.#pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error));
    }
  }

  #dropClient(reason: Error): void {
    const client = this.#client;
    this.#client = undefined;
    client?.close();
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(reason);
      this.#pending.delete(id);
    }
  }
}
