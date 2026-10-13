import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBridgeClient } from "@/features/bridge/background/bridge-client";
import { BRIDGE_PROTOCOL_VERSION, type BridgeCommand } from "@/shared/messaging/bridge-protocol";

class FakeSocket {
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function setup(
  tokens: (string | undefined)[],
  handle: (command: BridgeCommand) => Promise<unknown> = async () => ({ ok: 1 }),
) {
  const sockets: FakeSocket[] = [];
  let tokenIndex = 0;
  const client = startBridgeClient({
    handle,
    url: "ws://test",
    readToken: async () => tokens[Math.min(tokenIndex++, tokens.length - 1)],
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    minReconnectDelayMs: 1_000,
    maxReconnectDelayMs: 4_000,
  });
  return { client, sockets, handle };
}

describe("startBridgeClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays idle without a token", async () => {
    const { sockets } = setup([undefined]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(0);
  });

  it("authenticates, then answers commands and reports handler errors", async () => {
    const handle = vi.fn(async (command: { type: string }) => {
      if (command.type === "switchSpace") {
        throw new Error("Space not found: nope");
      }
      return [{ id: "s1" }];
    });
    const { sockets } = setup(["secret"], handle);
    await vi.advanceTimersByTimeAsync(0);
    const socket = sockets[0]!;
    socket.open();
    expect(socket.sent[0]).toEqual({
      type: "hello",
      token: "secret",
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
    });

    socket.receive({ type: "welcome" });
    socket.receive({ id: "a", command: { type: "listSpaces" } });
    socket.receive({ id: "b", command: { type: "switchSpace", spaceId: "nope" } });
    socket.receive({ id: "c", command: { type: "deleteEverything" } });
    await vi.advanceTimersByTimeAsync(0);

    // Responses carry their request id, so their order does not matter.
    const responses = socket.sent.slice(1);
    expect(responses).toHaveLength(3);
    expect(responses).toEqual(
      expect.arrayContaining([
        { id: "a", ok: true, result: [{ id: "s1" }] },
        { id: "b", ok: false, error: "Space not found: nope" },
        { id: "c", ok: false, error: "Invalid bridge command." },
      ]),
    );
  });

  it("backs off between failed attempts", async () => {
    const { sockets } = setup(["secret"]);
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.close();

    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.close();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
  });

  it("reconnects immediately with the new token and drops the old socket", async () => {
    const { client, sockets } = setup(["old", "new"]);
    await vi.advanceTimersByTimeAsync(0);
    client.reconnect();
    await vi.advanceTimersByTimeAsync(0);

    expect(sockets).toHaveLength(2);
    expect(sockets[0]!.readyState).toBe(3);
    sockets[1]!.open();
    expect(sockets[1]!.sent[0]).toMatchObject({ token: "new" });

    // The replaced socket's close event must not schedule an extra attempt.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(2);
  });
});
