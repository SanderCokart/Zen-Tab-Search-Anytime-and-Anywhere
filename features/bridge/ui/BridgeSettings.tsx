import { useEffect, useState } from "preact/hooks";
import { generateBridgeToken, normalizeBridgeToken } from "@/features/bridge/model/token";
import {
  cursorInstallUrl,
  mcpConfigFragment,
  MCP_PATH_PLACEHOLDER,
  MCP_SERVER_ASSET_PATH,
  MCP_SERVER_FILE_NAME,
} from "@/features/bridge/model/mcp-install";
import { settingsKeyClass } from "@/shared/ui/button-styles";
import { Lcd } from "@/shared/ui/primitives/Lcd";
import { FieldText, Module } from "@/shared/ui/primitives/Module";
import { Switch } from "@/shared/ui/primitives/Switch";
import { BRIDGE_PORT, BRIDGE_TOKEN_STORAGE_KEY } from "@/shared/messaging/bridge-protocol";

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
    <Module title="AI agents" meta="MCP" wide>
      <Switch
        checked={!!token}
        disabled={!loaded}
        data-testid="zen-bridgeEnabled"
        showState
        onChange={(checked) => saveToken(checked ? generateBridgeToken() : undefined)}
      >
        <FieldText
          label="Let a local MCP server control Zen"
          hint={`Claude, Cursor and other MCP clients can then read and organise your tabs, folders and spaces through the Zen Deck MCP server. It connects only over this computer (127.0.0.1:${BRIDGE_PORT}) and only with the token below.`}
        />
      </Switch>
      {token && (
        <div class="flex flex-col gap-[var(--zen-space-3)]">
          <span class="text-[length:var(--zen-text-sm)] text-[var(--zs-ink-3)]">
            Set <code>ZEN_BRIDGE_TOKEN</code> to this value in your MCP client's config.
          </span>
          <Lcd class="flex items-center gap-[var(--zen-space-3)] px-[var(--zen-space-3)] py-[var(--zen-space-2)]">
            <em class="zs-label zs-label-red not-italic">TOKEN</em>
            <input
              type="text"
              readOnly
              class="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[length:var(--zen-text-md)] text-inherit outline-none"
              data-testid="zen-bridgeToken"
              value={token}
              aria-label="MCP bridge token"
              onFocus={(event) => event.currentTarget.select()}
            />
          </Lcd>
          <div class="flex flex-wrap gap-[var(--zen-space-2)]">
            <button type="button" class={settingsKeyClass} onClick={copyToken}>
              {copied ? "Copied" : "Copy token"}
            </button>
            <button
              type="button"
              class={settingsKeyClass}
              title="Disconnects any MCP server still using the old token"
              onClick={() => saveToken(generateBridgeToken())}
            >
              New token
            </button>
          </div>
          <div class="flex flex-wrap gap-[var(--zen-space-2)]" data-testid="zen-mcpActions">
            <button
              type="button"
              class={settingsKeyClass}
              data-testid="zen-mcpDownload"
              onClick={() => void downloadServer()}
            >
              Download MCP server
            </button>
            <a
              class={settingsKeyClass}
              role="button"
              data-testid="zen-mcpAddToCursor"
              href={cursorInstallUrl(token)}
              title="Opens Cursor and adds this server. Replace the path placeholder afterwards."
            >
              Add to Cursor
            </a>
            <button
              type="button"
              class={settingsKeyClass}
              data-testid="zen-mcpCopyConfig"
              title="Copies an mcpServers JSON fragment with placeholders for the path and token"
              onClick={copyConfig}
            >
              {configCopied ? "Copied config" : "Copy MCP config"}
            </button>
          </div>
          {downloadFailed && (
            <span class="text-zen-danger text-[length:var(--zen-text-sm)]">
              Download failed. Reload the extension and try again.
            </span>
          )}
          <span class="text-[length:var(--zen-text-sm)] text-[var(--zs-ink-3)]">
            Download the server first, then replace <code>{MCP_PATH_PLACEHOLDER}</code> with the
            path to the saved file. Claude Desktop and Claude Code have no link to add a server, so
            use Copy MCP config and paste it into their config, replacing the placeholders.
          </span>
        </div>
      )}
    </Module>
  );
}
