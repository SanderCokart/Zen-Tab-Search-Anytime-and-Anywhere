import { describe, expect, it } from "vitest";
import {
  cursorInstallUrl,
  mcpConfigFragment,
  MCP_PATH_PLACEHOLDER,
  MCP_SERVER_NAME,
  MCP_TOKEN_PLACEHOLDER,
  mcpServerDownloadUrl,
  mcpServerReleasePageUrl,
} from "@/features/bridge/model/mcp-install";
import { RELEASE_DOWNLOAD_PREFIX } from "@/features/updates/model/release";

function fromBase64Url(value: string): string {
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") + "==".slice(0, (4 - (value.length % 4)) % 4);
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

describe("mcpServerDownloadUrl", () => {
  it("points at the asset of the release matching the extension, not the latest", () => {
    expect(mcpServerDownloadUrl("5.4.0")).toBe(
      "https://github.com/SanderCokart/Zen-Deck/releases/download/v5.4.0/zen-deck-mcp.mjs",
    );
  });

  it("stays under the prefix the update check trusts", () => {
    expect(mcpServerDownloadUrl("1.2.3").startsWith(RELEASE_DOWNLOAD_PREFIX)).toBe(true);
  });
});

describe("mcpServerReleasePageUrl", () => {
  it("links the release page of the matching version", () => {
    expect(mcpServerReleasePageUrl("5.4.0")).toBe(
      "https://github.com/SanderCokart/Zen-Deck/releases/tag/v5.4.0",
    );
  });
});
