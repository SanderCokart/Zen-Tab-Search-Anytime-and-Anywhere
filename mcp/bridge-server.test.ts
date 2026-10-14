// @vitest-environment node
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BRIDGE_PROTOCOL_VERSION } from "@/shared/messaging/bridge-protocol";
import { probePort, requestYield, ZenBridge } from "./bridge-server";

const TOKEN = "test-token";
let bridge: ZenBridge | undefined;
const extraBridges: ZenBridge[] = [];
const sockets: WebSocket[] = [];

async function startBridge(requestTimeoutMs = 2_000): Promise<ZenBridge> {
  bridge = new ZenBridge({ token: TOKEN, port: 0, requestTimeoutMs });
  await bridge.start();
  return bridge;
}

/** Connects like the extension does and resolves with the first server reply. */
function connectZen(
  target: ZenBridge,
  token: string,
  origin = "moz-extension://abc",
): Promise<{ socket: WebSocket; reply: { type: string } }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${target.port}`, { origin });
    sockets.push(socket);
    socket.once("error", reject);
    socket.once("open", () => {
      socket.send(
        JSON.stringify({ type: "hello", token, protocolVersion: BRIDGE_PROTOCOL_VERSION }),
      );
    });
    socket.once("message", (data) => resolve({ socket, reply: JSON.parse(data.toString()) }));
  });
}

/** Answers every command with `answer(command)`, like the extension's command handler. */
function serve(socket: WebSocket, answer: (command: { type: string }) => object): void {
  socket.on("message", (data) => {
    const request = JSON.parse(data.toString()) as { id: string; command: { type: string } };
    socket.send(JSON.stringify({ id: request.id, ...answer(request.command) }));
  });
}

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    socket.terminate();
  }
  bridge?.close();
  bridge = undefined;
  for (const extra of extraBridges.splice(0)) {
    extra.close();
  }
});

/** A port nothing listens on: bind to 0, note the port, then release it. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe("ZenBridge", () => {
  it("fails fast while Zen is not connected", async () => {
    const zen = await startBridge();
    expect(zen.connected).toBe(false);
    await expect(zen.request({ type: "listSpaces" })).rejects.toThrow(
      /Zen has not connected since this server started .* "AI agents \(MCP\)" is turned on/,
    );
  });

  it("a newer server takes the port over, and the older one stays passive", async () => {
    // A fixed port: the bridge retries on the port it was asked for, and port 0 would pick a new one.
    const port = await freePort();
    const first = new ZenBridge({ token: TOKEN, port, version: "1.2.3", retryMs: { held: 50 } });
    extraBridges.push(first);
    await first.start();
    const second = new ZenBridge({ token: TOKEN, port, retryMs: { held: 50 } });
    extraBridges.push(second);
    await second.start();

    expect(second.listening).toBe(true);
    await vi.waitFor(() => expect(first.status().bridge).toBe("yielded"));
    expect(first.listening).toBe(false);
    expect(first.unavailableReason).toContain(
      `taken over by another zen-tab-search MCP server (process ${process.pid})`,
    );
    await expect(first.request({ type: "listSpaces" })).rejects.toThrow("stays passive");

    // While the newer server holds the port, the older one must not take it back.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(first.listening).toBe(false);
    expect(second.listening).toBe(true);

    second.close();
    // The yielded server waits a grace period before it retries, so allow for that.
    await vi.waitFor(() => expect(first.listening).toBe(true), { timeout: 4_000 });
    await expect(connectZen(first, TOKEN)).resolves.toMatchObject({ reply: { type: "welcome" } });
  });

  it("refuses to hand over the port to a peer without the token", async () => {
    const holder = new ZenBridge({ token: TOKEN, port: 0 });
    extraBridges.push(holder);
    await holder.start();

    await expect(requestYield(holder.port, "wrong-token", 1)).resolves.toBe(false);
    expect(holder.listening).toBe(true);
  });

  it("names a version mismatch, but only to a peer with the right token", async () => {
    const zen = await startBridge();
    const helloWith = (token: string) =>
      new Promise<unknown>((resolve) => {
        const socket = new WebSocket(`ws://127.0.0.1:${zen.port}`, {
          origin: "moz-extension://abc",
        });
        sockets.push(socket);
        socket.once("open", () =>
          socket.send(JSON.stringify({ type: "hello", token, protocolVersion: 999 })),
        );
        socket.once("message", (data) => resolve(JSON.parse(data.toString())));
      });

    await expect(helloWith("wrong")).resolves.toEqual({ type: "rejected" });
    expect(zen.unavailableReason).toContain("token does not match ZEN_BRIDGE_TOKEN");

    await expect(helloWith(TOKEN)).resolves.toEqual({ type: "rejected", reason: "protocol" });
    expect(zen.unavailableReason).toContain("Version mismatch");
    expect(zen.unavailableReason).toContain("protocol 999");

    await connectZen(zen, TOKEN);
    expect(zen.unavailableReason).toBeUndefined();
  });

  it("refuses connections from web page origins", async () => {
    const zen = await startBridge();
    await expect(connectZen(zen, TOKEN, "https://evil.example")).rejects.toThrow();
    expect(zen.connected).toBe(false);
  });

  it("rejects a wrong token", async () => {
    const zen = await startBridge();
    const { socket, reply } = await connectZen(zen, "wrong");
    expect(reply).toEqual({ type: "rejected" });
    await new Promise((resolve) => socket.once("close", resolve));
    expect(zen.connected).toBe(false);
    expect(zen.unavailableReason).toMatch(
      /token does not match ZEN_BRIDGE_TOKEN\. Copy the token again/,
    );
  });

  it("round-trips commands, results and errors once authenticated", async () => {
    const zen = await startBridge();
    const { socket, reply } = await connectZen(zen, TOKEN);
    expect(reply).toEqual({ type: "welcome" });
    expect(zen.connected).toBe(true);
    serve(socket, (command) =>
      command.type === "listSpaces"
        ? { ok: true, result: [{ id: "s1", name: "Work" }] }
        : { ok: false, error: "Space not found: x" },
    );

    await expect(zen.request({ type: "listSpaces" })).resolves.toEqual([
      { id: "s1", name: "Work" },
    ]);
    await expect(zen.request({ type: "switchSpace", spaceId: "x" })).rejects.toThrow(
      "Space not found: x",
    );
  });

  it("times out when Zen never answers", async () => {
    const zen = await startBridge(50);
    await connectZen(zen, TOKEN);
    await expect(zen.request({ type: "listTabs" })).rejects.toThrow("did not answer listTabs");
  });

  it("lets a newer Zen connection replace the old one", async () => {
    const zen = await startBridge();
    const first = await connectZen(zen, TOKEN);
    // Attach the expectation first: the rejection lands while the second socket connects.
    const pending = expect(zen.request({ type: "listFolders" })).rejects.toThrow(
      "Replaced by a newer Zen connection",
    );
    const second = await connectZen(zen, TOKEN);

    await pending;
    await new Promise((resolve) =>
      first.socket.readyState === WebSocket.CLOSED
        ? resolve(null)
        : first.socket.once("close", resolve),
    );
    serve(second.socket, () => ({ ok: true, result: [] }));
    await expect(zen.request({ type: "listFolders" })).resolves.toEqual([]);
  });
});

describe("probePort", () => {
  it("reports a port nothing listens on as free, not occupied", async () => {
    await expect(probePort(await freePort())).resolves.toEqual({ kind: "free" });
  });

  it("recognises a program that is not a zen-tab-search server", async () => {
    const server = createServer((_request, response) => response.end("hello"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      await expect(probePort(port)).resolves.toEqual({ kind: "other-program" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
