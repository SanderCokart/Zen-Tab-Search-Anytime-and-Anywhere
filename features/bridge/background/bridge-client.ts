import { debugLog, debugWarn } from "@/shared/debug";
import { LOG_PREFIX } from "@/shared/log";
import { normalizeBridgeToken } from "@/features/bridge/model/token";
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_TOKEN_STORAGE_KEY,
  BRIDGE_URL,
  parseBridgeRequest,
  type BridgeCommand,
  type BridgeResponse,
} from "@/shared/messaging/bridge-protocol";

const MIN_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
// WebSocket.OPEN; spelled out so tests can pass a plain fake socket.
const SOCKET_OPEN = 1;

export interface BridgeClientOptions {
  handle(command: BridgeCommand): Promise<unknown>;
  url?: string;
  readToken?: () => Promise<string | undefined>;
  createSocket?: (url: string) => WebSocket;
  minReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

function defaultReadToken(): Promise<string | undefined> {
  return browser.storage.local
    .get(BRIDGE_TOKEN_STORAGE_KEY)
    .then((stored) => normalizeBridgeToken(stored[BRIDGE_TOKEN_STORAGE_KEY]));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Keeps one outbound connection to the MCP server and answers its commands.
 * The server cannot be reached from the page side, so this is the only path
 * from an agent into Zen. It stays idle until a token is stored.
 */
export function startBridgeClient(options: BridgeClientOptions): {
  reconnect(): void;
  stop(): void;
} {
  const url = options.url ?? BRIDGE_URL;
  const readToken = options.readToken ?? defaultReadToken;
  const createSocket = options.createSocket ?? ((target: string) => new WebSocket(target));
  const minDelay = options.minReconnectDelayMs ?? MIN_RECONNECT_DELAY_MS;
  const maxDelay = options.maxReconnectDelayMs ?? MAX_RECONNECT_DELAY_MS;

  let socket: WebSocket | undefined;
  let connecting = false;
  // Bumped by reconnect() so a connect() still reading the old token retries.
  let generation = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let delay = minDelay;
  let stopped = false;

  // Back off while the MCP server is not running: every failed attempt logs a
  // connection error in Zen's console, so retrying every few seconds is noisy.
  function scheduleReconnect(): void {
    if (stopped || reconnectTimer !== undefined) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
    delay = Math.min(delay * 2, maxDelay);
  }

  function send(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === SOCKET_OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  async function answer(ws: WebSocket, data: unknown): Promise<void> {
    let message: unknown;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }

    if (typeof message === "object" && message !== null && "type" in message) {
      if (message.type === "welcome") {
        delay = minDelay;
        debugLog(`${LOG_PREFIX} MCP bridge connected`);
      } else if (message.type === "rejected") {
        const protocol = "reason" in message && message.reason === "protocol";
        debugWarn(
          `${LOG_PREFIX} MCP bridge rejected the connection:`,
          protocol
            ? "the MCP server is from a different release; update both."
            : "wrong token; check ZEN_BRIDGE_TOKEN.",
        );
      }
      return;
    }

    const request = parseBridgeRequest(message);
    if (!request) {
      const id = (message as { id?: unknown } | null)?.id;
      if (typeof id === "string" && id) {
        send(ws, { id, ok: false, error: "Invalid bridge command." });
      }
      return;
    }

    let response: BridgeResponse;
    try {
      const result = await options.handle(request.command);
      response = { id: request.id, ok: true, result: result ?? null };
    } catch (error) {
      response = { id: request.id, ok: false, error: errorMessage(error) };
    }
    send(ws, response);
  }

  async function connect(): Promise<void> {
    if (stopped || socket || connecting) {
      return;
    }
    connecting = true;
    const startedAt = generation;
    let retry = false;
    try {
      const token = await readToken().catch(() => undefined);
      if (startedAt !== generation) {
        retry = true;
        return;
      }
      if (!token) {
        // Stay idle; storing a token calls reconnect().
        return;
      }

      const ws = createSocket(url);
      socket = ws;
      ws.onopen = () => {
        send(ws, { type: "hello", token, protocolVersion: BRIDGE_PROTOCOL_VERSION });
      };
      ws.onmessage = (event: MessageEvent) => {
        void answer(ws, event.data);
      };
      ws.onclose = () => {
        // A socket replaced by reconnect() must not schedule another attempt.
        if (socket === ws) {
          socket = undefined;
          scheduleReconnect();
        }
      };
      ws.onerror = () => {
        // The close event that follows handles reconnecting.
      };
    } catch (error) {
      debugWarn(`${LOG_PREFIX} Could not open MCP bridge socket:`, errorMessage(error));
      scheduleReconnect();
    } finally {
      connecting = false;
      if (retry) {
        void connect();
      }
    }
  }

  function reconnect(): void {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    delay = minDelay;
    generation++;
    const current = socket;
    socket = undefined;
    current?.close();
    void connect();
  }

  function stop(): void {
    stopped = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    const current = socket;
    socket = undefined;
    current?.close();
  }

  void connect();
  return { reconnect, stop };
}
