/** Name the MCP server is registered under in client configs. */
export const MCP_SERVER_NAME = "zen-tab-search";

/** File name the settings page downloads the server as. */
export const MCP_SERVER_FILE_NAME = "zen-tab-search-mcp.mjs";

/** Path inside the extension package; matches the asset added in wxt.config.ts. */
export const MCP_SERVER_ASSET_PATH = "mcp/zen-tab-search-mcp.mjs";

/** Stand-ins the user replaces: where they saved the server, and the token from this page. */
export const MCP_PATH_PLACEHOLDER = `<path-to>/${MCP_SERVER_FILE_NAME}`;
export const MCP_TOKEN_PLACEHOLDER = "<token>";

export interface McpServerEntry {
  command: string;
  args: string[];
  env: { ZEN_BRIDGE_TOKEN: string };
}

export function mcpServerEntry(token: string, serverPath: string): McpServerEntry {
  return {
    command: "node",
    args: [serverPath],
    env: { ZEN_BRIDGE_TOKEN: token },
  };
}

/**
 * The `mcpServers` fragment for Claude Desktop, Claude Code and Cursor's mcp.json.
 * Both the path and the token are placeholders, so the copied text is safe to share.
 */
export function mcpConfigFragment(): string {
  const fragment = {
    mcpServers: {
      [MCP_SERVER_NAME]: mcpServerEntry(MCP_TOKEN_PLACEHOLDER, MCP_PATH_PLACEHOLDER),
    },
  };
  return JSON.stringify(fragment, null, 2);
}

/**
 * Cursor's one-click install link. `config` is base64url JSON (no padding) so Cursor
 * can read it as raw base64. Percent-encoding `+`/`/`/`=` via `URLSearchParams` is
 * what produced "Invalid server configuration provided: Not valid JSON."
 * The path stays a placeholder because the extension cannot know where the file was saved.
 */
export function cursorInstallUrl(token: string): string {
  const entry = { type: "stdio" as const, ...mcpServerEntry(token, MCP_PATH_PLACEHOLDER) };
  const config = toBase64Url(JSON.stringify(entry));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(MCP_SERVER_NAME)}&config=${config}`;
}

/** URL-safe base64 without padding, so the query value is `[A-Za-z0-9_-]+`. */
function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
