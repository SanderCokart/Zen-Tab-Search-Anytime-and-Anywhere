#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BRIDGE_PORT } from "@/shared/messaging/bridge-protocol";
import { ZenBridge } from "./bridge-server";
import { registerZenTools } from "./tools";

// Replaced with the package version by scripts/build-mcp.mjs.
declare const __ZEN_MCP_VERSION__: string;
const VERSION = typeof __ZEN_MCP_VERSION__ === "string" ? __ZEN_MCP_VERSION__ : "dev";

if (process.argv.includes("--version")) {
  process.stdout.write(`${VERSION}
`);
  process.exit(0);
}

// stdout carries the MCP protocol, so every log line goes to stderr.
function log(message: string): void {
  process.stderr.write(`[zen-tab-search-mcp] ${message}\n`);
}

const token = process.env.ZEN_BRIDGE_TOKEN?.trim();
if (!token) {
  log('ZEN_BRIDGE_TOKEN is not set. Copy it from "AI agents (MCP)" in Zen Tab Search\'s settings.');
  process.exit(1);
}

const port = Number(process.env.ZEN_BRIDGE_PORT) || BRIDGE_PORT;
const bridge = new ZenBridge({ token, port, version: VERSION, log });

// When the port is taken this keeps serving, so tools can say who holds it,
// and keeps retrying so it takes over once the other server exits.
await bridge.start();

const server = new McpServer({ name: "zen-tab-search", version: VERSION });
registerZenTools(server, bridge);
await server.connect(new StdioServerTransport());
log(`MCP server ${VERSION} ready`);

// The listening socket would keep this process alive after its MCP client is
// gone, holding the port so no other client's server could reach Zen.
let shuttingDown = false;
function shutDown(reason: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log(`shutting down: ${reason}`);
  bridge.close();
  process.exit(0);
}
process.stdin.on("end", () => shutDown("the MCP client closed stdin"));
process.stdin.on("close", () => shutDown("the MCP client closed stdin"));
process.on("SIGINT", () => shutDown("SIGINT"));
process.on("SIGTERM", () => shutDown("SIGTERM"));
