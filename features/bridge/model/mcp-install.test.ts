import { describe, expect, it } from "vitest";
import {
  cursorInstallUrl,
  mcpConfigFragment,
  MCP_PATH_PLACEHOLDER,
  MCP_SERVER_NAME,
  MCP_TOKEN_PLACEHOLDER,
} from "@/features/bridge/model/mcp-install";

function fromBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "==".slice(0, (4 - (value.length % 4)) % 4);
  return atob(padded);
}

describe("mcpConfigFragment", () => {
  it("returns an mcpServers entry with path and token placeholders", () => {
    const fragment = JSON.parse(mcpConfigFragment());
    expect(fragment).toEqual({
      mcpServers: {
        [MCP_SERVER_NAME]: {
          command: "node",
          args: [MCP_PATH_PLACEHOLDER],
          env: { ZEN_BRIDGE_TOKEN: MCP_TOKEN_PLACEHOLDER },
        },
      },
    });
  });

  it("never contains a real token", () => {
    expect(mcpConfigFragment()).toContain(MCP_TOKEN_PLACEHOLDER);
  });
});

describe("cursorInstallUrl", () => {
  it("builds a Cursor MCP install deeplink carrying the base64url config", () => {
    const token = "ab".repeat(32);
    const href = cursorInstallUrl(token);
    const url = new URL(href);

    expect(url.protocol).toBe("cursor:");
    expect(url.host).toBe("anysphere.cursor-deeplink");
    expect(url.pathname).toBe("/mcp/install");
    expect(url.searchParams.get("name")).toBe(MCP_SERVER_NAME);

    const encoded = url.searchParams.get("config") ?? "";
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(href).not.toContain("%");

    const config = JSON.parse(fromBase64Url(encoded)) as unknown;
    expect(config).toEqual({
      type: "stdio",
      command: "node",
      args: [MCP_PATH_PLACEHOLDER],
      env: { ZEN_BRIDGE_TOKEN: token },
    });
  });
});
