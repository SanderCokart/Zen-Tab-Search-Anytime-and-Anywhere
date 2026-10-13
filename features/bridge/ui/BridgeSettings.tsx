import { useEffect, useState } from "preact/hooks";
import { generateBridgeToken, normalizeBridgeToken } from "@/features/bridge/model/token";
import {
  cursorInstallUrl,
  mcpConfigFragment,
  MCP_PATH_PLACEHOLDER,
  MCP_SERVER_ASSET_PATH,
  MCP_SERVER_FILE_NAME,
} from "@/features/bridge/model/mcp-install";
import { BRIDGE_PORT, BRIDGE_TOKEN_STORAGE_KEY } from "@/shared/messaging/bridge-protocol";

const smallButtonClass =
  "border-zen-clear text-zen-faint hover:bg-zen-surface cursor-pointer rounded-md border bg-transparent px-2 py-1 font-[inherit] text-xs disabled:cursor-not-allowed disabled:opacity-40 no-underline";

/**
 * Opt-in pairing for the local MCP server. Storing a token is what turns the
 * bridge on; the background script reconnects whenever the token changes.
 */
export function BridgeSettings() {
  const [token, setToken] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  useEffect(() => {
    void browser.storage.local
      .get(BRIDGE_TOKEN_STORAGE_KEY)
      .then((stored) => setToken(normalizeBridgeToken(stored[BRIDGE_TOKEN_STORAGE_KEY])))
      .finally(() => setLoaded(true));
  }, []);

  const saveToken = (next: string | undefined) => {
    setToken(next);
    setCopied(false);
    void (next
      ? browser.storage.local.set({ [BRIDGE_TOKEN_STORAGE_KEY]: next })
      : browser.storage.local.remove(BRIDGE_TOKEN_STORAGE_KEY));
  };

  const copyToken = () => {
    if (!token) {
      return;
    }
    void navigator.clipboard.writeText(token).then(() => setCopied(true));
  };

  const copyConfig = () => {
    void navigator.clipboard.writeText(mcpConfigFragment()).then(() => setConfigCopied(true));
  };

  const downloadServer = async () => {
    setDownloadFailed(false);
    try {
      // WXT types getURL against known public paths, so resolve the bundled asset from the root.
      const assetUrl = new URL(MCP_SERVER_ASSET_PATH, browser.runtime.getURL("/"));
      const response = await fetch(assetUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = MCP_SERVER_FILE_NAME;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setDownloadFailed(true);
    }
  };

  return (
    <fieldset class="border-zen-line m-0 flex flex-col gap-3 rounded-md border p-3">
      <legend class="px-1 text-sm font-medium">AI agents (MCP)</legend>
      <label class="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          class="accent-zen-accent mt-1 size-4"
          data-testid="zen-bridgeEnabled"
          checked={!!token}
          disabled={!loaded}
          onChange={(event) =>
            saveToken(event.currentTarget.checked ? generateBridgeToken() : undefined)
          }
        />
        <span>
          <span class="block text-sm font-medium">Let a local MCP server control Zen</span>
          <span class="text-zen-subtle block text-xs">
            Claude, Cursor and other MCP clients can then read and organise your tabs, folders and
            spaces through the Zen Tab Search MCP server. It connects only over this computer
            (127.0.0.1:{BRIDGE_PORT}) and only with the token below.
          </span>
        </span>
      </label>
      {token && (
        <div class="ml-7 flex flex-col gap-2">
          <span class="text-zen-subtle text-xs">
            Set <code>ZEN_BRIDGE_TOKEN</code> to this value in your MCP client's config.
          </span>
          <input
            type="text"
            readOnly
            class="border-zen-line bg-zen-surface rounded-md border px-2 py-1 font-mono text-xs text-inherit"
            data-testid="zen-bridgeToken"
            value={token}
            aria-label="MCP bridge token"
            onFocus={(event) => event.currentTarget.select()}
          />
          <div class="flex flex-wrap gap-2">
            <button type="button" class={smallButtonClass} onClick={copyToken}>
              {copied ? "Copied" : "Copy token"}
            </button>
            <button
              type="button"
              class={smallButtonClass}
              title="Disconnects any MCP server still using the old token"
              onClick={() => saveToken(generateBridgeToken())}
            >
              New token
            </button>
          </div>
          <div class="flex flex-wrap gap-2" data-testid="zen-mcpActions">
            <button
              type="button"
              class={smallButtonClass}
              data-testid="zen-mcpDownload"
              onClick={() => void downloadServer()}
            >
              Download MCP server
            </button>
            <a
              class={smallButtonClass}
              role="button"
              data-testid="zen-mcpAddToCursor"
              href={cursorInstallUrl(token)}
              title="Opens Cursor and adds this server. Replace the path placeholder afterwards."
            >
              Add to Cursor
            </a>
            <button
              type="button"
              class={smallButtonClass}
              data-testid="zen-mcpCopyConfig"
              title="Copies an mcpServers JSON fragment with placeholders for the path and token"
              onClick={copyConfig}
            >
              {configCopied ? "Copied config" : "Copy MCP config"}
            </button>
          </div>
          {downloadFailed && (
            <span class="text-xs text-red-400">
              Download failed. Reload the extension and try again.
            </span>
          )}
          <span class="text-zen-subtle text-xs">
            Download the server first, then replace <code>{MCP_PATH_PLACEHOLDER}</code> with the
            path to the saved file. Claude Desktop and Claude Code have no link to add a server, so
            use Copy MCP config and paste it into their config, replacing the placeholders.
          </span>
        </div>
      )}
    </fieldset>
  );
}
